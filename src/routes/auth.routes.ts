import express, { Request, Response, RequestHandler } from 'express';
import { body } from 'express-validator';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';
import Permission, { IPermission } from '../models/Permission';
import { auth, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

// Register route
router.post('/register',
  [
    body('employeeNumber').notEmpty(),
    body('password').isLength({ min: 6 }),
    body('firstName').notEmpty(),
    body('lastName').notEmpty(),
  ],
  (async (req: Request, res: Response) => {
    try {
      const { employeeNumber, password, firstName, lastName } = req.body;
      
      const existingUser = await User.findOne({ employeeNumber });
      if (existingUser) {
        return res.status(400).json({ message: 'Employee number already exists' });
      }

      // Get all permissions for the user based on role
      const defaultPermissions = await Permission.find({
        name: {
          $in: [
            'view_dashboard',
            'view_own_items',
            'create_items',
            'edit_own_items',
            'delete_own_items',
            'deliver_items',
            'view_delivered_items'
          ]
        }
      });

      const user = new User({
        employeeNumber,
        password,
        firstName,
        lastName,
        role: 'employee', // Default role
        permissions: defaultPermissions.map(p => p._id)
      });

      await user.save();
      await user.populate('permissions');

      const tokenPayload = {
        _id: user._id,
        employeeNumber: user.employeeNumber,
        role: user.role,
        permissions: user.permissions
      };

      const token = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET || 'your-secret-key',
        { 
          expiresIn: '24h',
          algorithm: 'HS256'
        }
      );

      // Return user without password
      const userResponse = {
        _id: user._id,
        employeeNumber: user.employeeNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        permissions: user.permissions
      };

      res.status(201).json({ user: userResponse, token });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Error creating user' });
    }
}) as RequestHandler);

// Add a helper function to convert string permissions to ObjectIds
const convertPermissionsToObjectIds = async (user: any) => {
  if (!user.permissions || !Array.isArray(user.permissions)) return;
  
  // Only process if we find any string permissions
  if (user.permissions.some((p: string | IPermission) => typeof p === 'string')) {
    const permissionDocs = await Promise.all(
      user.permissions.map(async (perm: string | IPermission) => {
        if (typeof perm === 'string') {
          return await Permission.findOne({ name: perm });
        }
        return perm;
      })
    );
    
    user.permissions = permissionDocs
      .filter(doc => doc !== null)
      .map(doc => doc._id);
    
    await user.save();
  }
};

// Login route with permission loading
router.post('/login', (async (req: Request, res: Response) => {
  try {
    console.log('Login attempt:', { 
      employeeNumber: req.body.employeeNumber,
      headers: req.headers,
      body: req.body
    });

    const { employeeNumber, password } = req.body;
    
    // Find user and populate permissions
    const user = await User.findOne({ employeeNumber }).populate('permissions');
    if (!user) {
      console.log('Login failed: User not found');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('Login failed: Invalid password');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // If user is admin, ensure they have all admin permissions
    if (user.role === 'admin') {
      console.log('Admin user detected, ensuring admin permissions');
      
      // Get all permissions from the permissions collection
      const allPermissions = await Permission.find({});
      
      // Update user permissions with all permission ObjectIds
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { $set: { permissions: allPermissions.map(p => p._id) } },
        { new: true }
      ).populate('permissions');
      
      if (updatedUser) {
        user.permissions = updatedUser.permissions;
      }
    }

    const tokenPayload = {
      _id: user._id,
      employeeNumber: user.employeeNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions: user.permissions
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    console.log('Login successful:', { 
      userId: user._id,
      role: user.role,
      permissions: user.permissions.length
    });

    res.json({
      token,
      user: {
        _id: user._id,
        employeeNumber: user.employeeNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
}) as RequestHandler);

// Get available permissions
router.get('/permissions', async (req: Request, res: Response) => {
  try {
    const permissions = [
      { name: 'view_dashboard', description: 'View the dashboard' },
      { name: 'view_all_items', description: 'View all lost and found items' },
      { name: 'view_own_items', description: 'View items you created' },
      { name: 'create_items', description: 'Create new lost and found items' },
      { name: 'edit_all_items', description: 'Edit any lost and found item' },
      { name: 'edit_own_items', description: 'Edit items you created' },
      { name: 'delete_all_items', description: 'Delete any lost and found item' },
      { name: 'delete_own_items', description: 'Delete items you created' },
      { name: 'manage_users', description: 'Manage system users' },
      { name: 'generate_reports', description: 'Generate system reports' },
      { name: 'deliver_items', description: 'Mark items as delivered' },
      { name: 'view_delivered_items', description: 'View delivered items' }
    ];
    res.json({ permissions });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ message: 'Error fetching permissions' });
  }
});

// Get all system permissions
router.get('/system-permissions', auth, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const permissions = await Permission.find();
    res.json(permissions);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ message: 'Error fetching permissions' });
  }
}) as RequestHandler);

// Update user permissions (admin only)
router.put('/users/:userId/permissions', auth, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if requesting user is admin
    const requestingUser = await User.findById(req.user._id);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { userId } = req.params;
    const { permissions } = req.body;

    // Validate all permissions exist in system by name
    const validPermissions = await Permission.find({ name: { $in: permissions } });
    if (validPermissions.length !== permissions.length) {
      return res.status(400).json({ message: 'Invalid permissions provided' });
    }

    // Update user permissions with permission document references
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { permissions: validPermissions.map(p => p._id) } },
      { new: true }
    ).populate('permissions');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Log permission update
    console.log(`Updated permissions for user ${user.employeeNumber}:`, 
      validPermissions.map(p => p.name));

    res.json({ 
      user: {
        _id: user._id,
        employeeNumber: user.employeeNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        permissions: user.permissions
      }
    });

  } catch (error) {
    console.error('Error updating permissions:', error);
    res.status(500).json({ message: 'Error updating permissions' });
  }
}) as RequestHandler);

// Add a route to reset password
router.post('/reset-password',
  auth,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 6 }),
  ],
  (async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user._id).select('+password');
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }

      user.password = newPassword;
      await user.save();

      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ message: 'Server error during password reset' });
    }
  }) as RequestHandler
);

// Get user permissions
router.get('/users/:userId/permissions', auth, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if the requesting user is an admin
    const requestingUser = await User.findById(req.user._id);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can view permissions' });
    }

    const { userId } = req.params;

    // Find the user
    const user = await User.findById(userId).populate('permissions');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return user permissions
    const userResponse = {
      _id: user._id,
      employeeNumber: user.employeeNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions: user.permissions
    };

    res.json({ user: userResponse });
  } catch (error) {
    console.error('Error getting permissions:', error);
    res.status(500).json({ message: 'Error getting permissions' });
  }
}) as RequestHandler);

// Get current user
router.get('/me', auth, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findById(req.user._id).select('-password').populate('permissions');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Include full user details including permissions
    res.json({
      _id: user._id,
      employeeNumber: user.employeeNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions: user.permissions
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user data' });
  }
}) as RequestHandler);

export default router;
