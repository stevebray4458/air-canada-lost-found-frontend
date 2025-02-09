import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Permission from '../models/Permission';
import { Types } from 'mongoose';

interface JwtPayload {
  _id: string;
  employeeNumber: string;
  role: string;
  permissions?: string[];
}

interface IPermission {
  _id: Types.ObjectId;
  name: string;
  enabled?: boolean;
}

// Define a type for permission checks
export type Permission = string | IPermission;

// Helper function to check if a permission is IPermission type
export function isIPermission(permission: Permission): permission is IPermission {
  return typeof permission !== 'string' && '_id' in permission;
}

// Helper function to check if a permission matches a name
export function matchesPermission(permission: Permission, permissionName: string): boolean {
  if (typeof permission === 'string') {
    return permission === permissionName;
  }
  // If it's an ObjectId, convert it to string for comparison
  if (permission._id && typeof permission._id === 'object') {
    return permission.name === permissionName;
  }
  // If it's a string ID, try to match the name
  return permission && permission.name === permissionName;
}

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: Types.ObjectId;
        employeeNumber: string;
        firstName: string;
        lastName: string;
        role: string;
        permissions: IPermission[];
        createdAt: Date;
        updatedAt: Date;
      };
      token?: string;
    }
  }
}

// Define a type for authenticated requests
export interface AuthenticatedRequest extends Request {
  user: {
    _id: Types.ObjectId;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    role: string;
    permissions: IPermission[];
    createdAt: Date;
    updatedAt: Date;
  };
  token?: string;
};

// Define a type for authenticated request handlers
export type AuthenticatedRequestHandler = RequestHandler<
  any,
  any,
  any,
  any,
  { user: {
    _id: Types.ObjectId;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    role: string;
    permissions: IPermission[];
    createdAt: Date;
    updatedAt: Date;
  }}
>;

// Authentication middleware
export const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ 
        message: 'No authentication token provided',
        code: 'NO_TOKEN'
      });
    }

    try {
      const decoded = jwt.verify(
        token, 
        process.env.JWT_SECRET || 'your-secret-key',
        { algorithms: ['HS256'] }
      ) as JwtPayload;

      // Get fresh user data to ensure permissions are up to date
      const user = await User.findOne({ 
        _id: new Types.ObjectId(decoded._id),
        employeeNumber: decoded.employeeNumber 
      }).populate('permissions');

      if (!user) {
        return res.status(401).json({ 
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // If user is admin, grant access immediately and ensure they have all permissions
      if (user.role === 'admin') {
        // Get all permissions and ensure admin has them
        const allPermissions = await Permission.find({});
        
        // Update user permissions with all permission ObjectIds
        const updatedUser = await User.findByIdAndUpdate(
          user._id,
          { $set: { permissions: allPermissions.map(p => p._id) } },
          { new: true }
        ).populate('permissions');

        // Set user and token in request with updated permissions
        (req as AuthenticatedRequest).user = updatedUser as unknown as {
          _id: Types.ObjectId;
          employeeNumber: string;
          firstName: string;
          lastName: string;
          role: string;
          permissions: IPermission[];
          createdAt: Date;
          updatedAt: Date;
        };
        (req as AuthenticatedRequest).token = token;
        return next();
      }

      // For non-admin users, ensure they have required permissions
      const requiredPermissions = await Permission.find({ name: { $in: ['view_dashboard', 'view_all_items', 'view_own_items', 'create_items', 'edit_all_items', 'edit_own_items', 'delete_all_items', 'delete_own_items', 'manage_users', 'generate_reports', 'deliver_items', 'view_delivered_items', 'view_own_delivered_items', 'revert_delivered_status'] } }).exec();

      // Cast permissions to IPermission since we know they are populated
      const userPermissions = (user.permissions as unknown as IPermission[]).map(permission => permission.name);

      const missingPermissions = requiredPermissions.filter(permission => !userPermissions.includes(permission.name));

      if (missingPermissions.length > 0) {
        // Add missing permissions
        await User.findByIdAndUpdate(
          user._id,
          { $push: { permissions: { $each: missingPermissions } } },
          { new: true }
        ).populate('permissions');
        console.log('Updated user permissions:', missingPermissions.map(permission => permission.name));
      }

      // Convert user document to a plain object and ensure permissions is populated
      const userObject = user.toObject();
      userObject.permissions = userObject.permissions || [];

      // Type assertion to ensure _id is treated as ObjectId
      const typedUserObject = userObject as unknown as {
        _id: Types.ObjectId;
        employeeNumber: string;
        firstName: string;
        lastName: string;
        role: string;
        permissions: IPermission[];
        createdAt: Date;
        updatedAt: Date;
      };

      // Assign the user object to req.user with the correct type
      (req as AuthenticatedRequest).user = typedUserObject;
      (req as AuthenticatedRequest).token = token;

      // Log successful authentication
      console.log('User authenticated:', {
        employeeNumber: typedUserObject.employeeNumber,
        role: typedUserObject.role,
        permissions: typedUserObject.permissions
      });

      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({ 
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      message: 'Server error during authentication',
      code: 'AUTH_ERROR'
    });
  }
};

// Permission middleware
export const hasPermission = (permissionName: string): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as AuthenticatedRequest).user;
      
      // Check if user exists and has permissions
      if (!user || !user.permissions) {
        return res.status(403).json({
          message: 'You do not have permission to access this page',
          code: 'PERMISSION_DENIED'
        });
      }

      // For admin users, check if they have the specific permission
      const hasSpecificPermission = user.permissions.some(p => matchesPermission(p, permissionName));
      
      if (hasSpecificPermission) {
        return next();
      }

      return res.status(403).json({
        message: 'You do not have permission to access this page',
        code: 'PERMISSION_DENIED'
      });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        message: 'Server error during permission check',
        code: 'PERMISSION_ERROR'
      });
    }
  };
};

// Multiple permissions middleware
export const hasAnyPermission = (permissionNames: string[]): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as AuthenticatedRequest).user;
      
      // If user is admin, grant access immediately
      if (user?.role === 'admin') {
        return next();
      }

      // For non-admin users, check if they have any of the required permissions
      if (!user?.permissions?.some(p => permissionNames.some(name => matchesPermission(p, name)))) {
        return res.status(403).json({
          message: 'You do not have permission to access this page',
          code: 'PERMISSION_DENIED'
        });
      }

      next();
    } catch (error) {
      res.status(500).json({ message: 'Error checking permissions' });
    }
  };
};

export const checkOwnership = (resourceId: string, userId: string) => {
  return resourceId === userId;
};
