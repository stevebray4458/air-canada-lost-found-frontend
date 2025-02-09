import express, { Response, RequestHandler } from 'express';
import { auth, AuthenticatedRequest } from '../middleware/auth';
import Permission from '../models/Permission';
import User from '../models/User';

const router = express.Router();

// Get all permissions
router.get('/', auth, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const permissions = await Permission.find({}).sort({ name: 1 });
    res.json(permissions);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ message: 'Error fetching permissions' });
  }
}) as RequestHandler);

// Create new permission (admin only)
router.post('/', auth, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can create permissions' });
    }

    const { name, description, component, action } = req.body;

    // Check if permission already exists
    const existingPermission = await Permission.findOne({ name });
    if (existingPermission) {
      return res.status(400).json({ message: 'Permission already exists' });
    }

    // Create new permission
    const permission = new Permission({
      name,
      description,
      component,
      action
    });

    await permission.save();
    res.status(201).json(permission);
  } catch (error) {
    console.error('Error creating permission:', error);
    res.status(500).json({ message: 'Error creating permission' });
  }
}) as RequestHandler);

// Update permission (admin only)
router.put('/:id', auth, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can update permissions' });
    }

    const { name, description, component, action } = req.body;
    const permission = await Permission.findByIdAndUpdate(
      req.params.id,
      { name, description, component, action },
      { new: true }
    );

    if (!permission) {
      return res.status(404).json({ message: 'Permission not found' });
    }

    res.json(permission);
  } catch (error) {
    console.error('Error updating permission:', error);
    res.status(500).json({ message: 'Error updating permission' });
  }
}) as RequestHandler);

// Delete permission (admin only)
router.delete('/:id', auth, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can delete permissions' });
    }

    const permission = await Permission.findByIdAndDelete(req.params.id);
    if (!permission) {
      return res.status(404).json({ message: 'Permission not found' });
    }

    // Remove this permission from all users
    await User.updateMany(
      { permissions: permission._id },
      { $pull: { permissions: permission._id } }
    );

    res.json({ message: 'Permission deleted successfully' });
  } catch (error) {
    console.error('Error deleting permission:', error);
    res.status(500).json({ message: 'Error deleting permission' });
  }
}) as RequestHandler);

export default router;
