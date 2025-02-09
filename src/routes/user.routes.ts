import express, { Request, Response, RequestHandler } from 'express';
import { body } from 'express-validator';
import User from '../models/User';
import Permission from '../models/Permission'; // Import Permission model
import { auth, hasPermission } from '../middleware/auth';
import { Types } from 'mongoose'; // Import Types from mongoose

const router = express.Router();

// Define valid role types
type UserRole = 'admin' | 'supervisor' | 'employee';

// Role-based default permissions
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    'view_dashboard',
    'view_all_items',
    'view_own_items',
    'create_items',
    'edit_all_items',
    'edit_own_items',
    'delete_all_items',
    'delete_own_items',
    'manage_users',
    'generate_reports',
    'deliver_items',
    'view_delivered_items'
  ],
  supervisor: [
    'view_dashboard',
    'view_all_items',
    'view_own_items',
    'create_items',
    'edit_all_items',
    'edit_own_items',
    'delete_all_items',
    'delete_own_items',
    'deliver_items',
    'view_delivered_items'
  ],
  employee: [
    'view_dashboard',
    'view_own_items',
    'create_items',
    'edit_own_items',
    'delete_own_items',
    'deliver_items',
    'view_delivered_items'
  ]
};

// Admin permissions - only for admin users
const ADMIN_PERMISSIONS = ROLE_PERMISSIONS.admin;

// Get all users (admin only)
router.get('/', auth, hasPermission('manage_users'), (async (req: Request, res: Response) => {
  try {
    const users = await User.find().select('-password');
    const usersWithoutPasswords = users.map(user => {
      const { password, ...userWithoutPassword } = user.toObject();
      return userWithoutPassword;
    });
    res.json(usersWithoutPasswords);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
}) as RequestHandler);

// Create new user (admin only)
router.post('/',
  auth,
  hasPermission('manage_users'),
  [
    body('employeeNumber').notEmpty(),
    body('password').isLength({ min: 6 }),
    body('firstName').notEmpty(),
    body('lastName').notEmpty(),
    body('role').isIn(['employee', 'supervisor', 'admin']),
  ],
  (async (req: Request, res: Response) => {
    try {
      const { employeeNumber, password, firstName, lastName, role } = req.body;
      
      const existingUser = await User.findOne({ employeeNumber });
      if (existingUser) {
        return res.status(400).json({ message: 'Employee number already exists' });
      }

      // Get default permissions for the role
      const defaultPermissionNames = ROLE_PERMISSIONS[role as UserRole] || [];
      
      // Find Permission documents for the default permissions
      const permissions = await Permission.find({ 
        name: { $in: defaultPermissionNames } 
      });

      // Create new user with permission ObjectIds
      const user = new User({
        employeeNumber,
        password,
        firstName,
        lastName,
        role,
        permissions: permissions.map(p => p._id)
      });

      await user.save();
      
      // Populate permissions before sending response
      await user.populate('permissions');
      
      const { password: _, ...userWithoutPassword } = user.toObject();
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Error creating user' });
    }
  }) as RequestHandler
);

// Update user (admin only)
router.put('/:id',
  auth,
  hasPermission('manage_users'),
  [
    body('firstName').notEmpty(),
    body('lastName').notEmpty(),
    body('role').isIn(['employee', 'supervisor', 'admin']),
  ],
  (async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, role } = req.body;
      
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      user.firstName = firstName;
      user.lastName = lastName;
      
      // Update role and set default permissions for the new role
      if (role !== user.role) {
        user.role = role;
        // Fetch Permission documents for the default role permissions
        const defaultPermissions = await Permission.find({
          name: { $in: ROLE_PERMISSIONS[role as UserRole] || [] }
        });
        const permissionObjectIds = defaultPermissions.map(p => new Types.ObjectId(p._id));
        user.permissions = permissionObjectIds;
      }

      if (req.body.password) {
        user.password = req.body.password;
      }

      await user.save();
      
      const { password: _, ...userResponse } = user.toObject();
      res.json(userResponse);
    } catch (error) {
      res.status(500).json({ message: 'Error updating user' });
    }
  }) as RequestHandler
);

// Update user permissions (admin only)
router.put('/:userId/permissions',
  auth,
  hasPermission('manage_users'),
  [
    body('permissions').isArray(),
  ],
  (async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { permissions } = req.body;

      // Type guard to ensure permissions is an array of strings
      if (!Array.isArray(permissions) || !permissions.every(p => typeof p === 'string')) {
        return res.status(400).json({ message: 'Permissions must be an array of strings' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // If the user is an admin, ensure they have all admin permissions
      if (user.role === 'admin') {
        // First, get all permission documents for the requested permissions
        const permissionDocs = await Permission.find({ name: { $in: permissions } });
        const permissionIds = permissionDocs.map(p => new Types.ObjectId(p._id));
        
        // Get admin permission documents
        const adminPermissionDocs = await Permission.find({ name: { $in: ADMIN_PERMISSIONS } });
        const adminPermissionIds = adminPermissionDocs.map(p => new Types.ObjectId(p._id));
        
        // Combine both sets of permissions and convert to ObjectId array
        const combinedIds = [...new Set([...permissionIds.map(id => id.toString()), ...adminPermissionIds.map(id => id.toString())])];
        user.permissions = combinedIds.map(id => new Types.ObjectId(id));
      } else {
        // For non-admin users, convert permission names to ObjectIds
        const permissionDocs = await Permission.find({ name: { $in: permissions } });
        const objectIdArray: Types.ObjectId[] = permissionDocs.map(p => new Types.ObjectId(p._id));
        user.permissions = objectIdArray;
      }

      await user.save();

      const { password: _, ...userWithoutPassword } = user.toObject();
      res.json({
        message: 'Permissions updated successfully',
        user: userWithoutPassword
      });
    } catch (error) {
      console.error('Error updating permissions:', error);
      res.status(500).json({ message: 'Error updating user permissions' });
    }
  }) as RequestHandler
);

// Get user permissions
router.get('/:userId/permissions',
  auth,
  (async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Users can only view their own permissions unless they're admin
      if (req.user.role !== 'admin' && req.user._id.toString() !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const user = await User.findById(userId).select('permissions');
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json(user.permissions);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching user permissions' });
    }
  }) as RequestHandler
);

// Reset user password (admin only)
router.post('/:id/reset-password',
  auth,
  hasPermission('manage_users'),
  [
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  ],
  (async (req: Request, res: Response) => {
    try {
      const { newPassword } = req.body;
      
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      user.password = newPassword;
      await user.save();
      
      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      console.error('Error resetting password:', error);
      res.status(500).json({ message: 'Error resetting password' });
    }
  }) as RequestHandler
);

// Delete user (admin only)
router.delete('/:id', auth, hasPermission('manage_users'), (async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.deleteOne();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting user' });
  }
}) as RequestHandler);

export default router;
