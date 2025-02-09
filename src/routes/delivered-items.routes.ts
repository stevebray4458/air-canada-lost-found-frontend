import express, { Request, Response, RequestHandler } from 'express';
import multer from 'multer';
import { auth, hasPermission, hasAnyPermission, AuthenticatedRequest, matchesPermission, Permission } from '../middleware/auth';
import DeliveredItem from '../models/DeliveredItem';
import LostItem from '../models/LostItem';
import cloudinaryService from '../services/cloudinary.service';
import { Document, Types } from 'mongoose';
import { DeliveredItem as IDeliveredItem } from '../interfaces/DeliveredItem';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Helper function to normalize status
const normalizeStatus = (status: string): 'onHand' | 'delivered' | 'inProcess' => {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('onhand') || statusLower.includes('on hand')) return 'onHand';
  if (statusLower.includes('deliver')) return 'delivered';
  if (statusLower.includes('process')) return 'inProcess';
  return 'onHand'; // default fallback
};

// Search delivered items
router.get('/search', auth, hasAnyPermission(['view_all_items', 'view_own_items']), (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const searchTerm = req.query.searchTerm as string;
    const includeArchived = req.query.includeArchived === 'true';
    
    const query: any = {};
    
    if (req.user.role === 'admin') {
      // Admin can see all items
    } else {
      // For non-admin users, check permissions
      const permissions: Permission[] = Array.isArray(req.user.permissions) ? req.user.permissions : [];
      const hasViewAllPermission = permissions.some(p => 
        p && matchesPermission(p, 'view_all_items')
      );
      
      if (!hasViewAllPermission && permissions.some(p => 
        p && matchesPermission(p, 'view_own_items')
      )) {
        query.foundBy = req.user._id;
      }
    }
    
    if (searchTerm) {
      query.$or = [
        { flightNumber: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } },
        { deliveredTo: { $regex: searchTerm, $options: 'i' } },
      ];
    }
    
    if (!includeArchived) {
      query.archived = false;
    }

    const items = await DeliveredItem.find(query)
      .populate('foundBy', 'firstName lastName employeeNumber')
      .populate('deliveredBy', 'firstName lastName employeeNumber')
      .sort({ dateDelivered: -1 });
    res.json(items);
  } catch (error) {
    console.error('Error searching delivered items:', error);
    res.status(500).json({ message: 'Error searching delivered items' });
  }
}) as RequestHandler);

// Get all delivered items
router.get('/', auth, hasAnyPermission(['view_delivered_items', 'view_own_delivered_items']), (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query: any = {};
    
    // Check permissions
    const permissions: Permission[] = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    const canViewAll = permissions.some(p => 
      p && matchesPermission(p, 'view_delivered_items')
    );
    
    if (!canViewAll) {
      // If user can only view their own delivered items
      query.foundBy = req.user._id;
    }
    
    const items = await DeliveredItem.find(query)
      .populate('foundBy', 'firstName lastName employeeNumber')
      .populate('deliveredBy', 'firstName lastName employeeNumber')
      .sort({ dateDelivered: -1 });
    res.json(items);
  } catch (error) {
    console.error('Error getting delivered items:', error);
    res.status(500).json({ message: 'Error getting delivered items' });
  }
}) as RequestHandler);

// Get all delivered items for the current user
router.get('/my', auth, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const items = await DeliveredItem.find({ foundBy: req.user._id })
      .populate('foundBy', 'firstName lastName employeeNumber')
      .populate('deliveredBy', 'firstName lastName employeeNumber')
      .sort({ dateDelivered: -1 });
    res.json(items);
  } catch (error) {
    console.error('Error getting user delivered items:', error);
    res.status(500).json({ message: 'Error getting delivered items' });
  }
}) as RequestHandler);

// Get a specific delivered item
router.get('/:id', auth, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await DeliveredItem.findById(req.params.id)
      .populate('foundBy', 'firstName lastName employeeNumber')
      .populate('deliveredBy', 'firstName lastName employeeNumber');

    if (!item) {
      return res.status(404).json({ message: 'Delivered item not found' });
    }

    // Check if user has permission to view this item
    const permissions: Permission[] = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    const canViewAll = permissions.some(p => 
      p && matchesPermission(p, 'view_delivered_items')
    );
    const canViewOwn = permissions.some(p => 
      p && matchesPermission(p, 'view_own_delivered_items')
    );
    
    if (!canViewAll && (!canViewOwn || item.foundBy._id.toString() !== req.user._id.toString())) {
      return res.status(403).json({ message: 'Not authorized to view this item' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error getting delivered item:', error);
    res.status(500).json({ message: 'Error getting delivered item' });
  }
}) as RequestHandler);

// Update a delivered item
router.put('/:id', auth, upload.array('photos', 5), hasAnyPermission(['edit_all_items', 'edit_own_items']), (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await DeliveredItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Delivered item not found' });
    }

    const { status, dateFound, ...otherUpdates } = req.body;
    const updates = {
      ...otherUpdates,
      dateFound: dateFound ? new Date(dateFound) : item.dateFound || new Date(), // Ensure dateFound is always a valid date
      ...(status && { status: normalizeStatus(status) })
    };

    if (req.user.role === 'admin') {
      // Admin can edit all items
    } else {
      // For non-admin users, check permissions
      const permissions: Permission[] = Array.isArray(req.user.permissions) ? req.user.permissions : [];
      const hasEditAllPermission = permissions.some(p => 
        p && matchesPermission(p, 'edit_all_items')
      );
      
      if (!hasEditAllPermission && 
          item.foundBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You do not have permission to edit this item' });
      }
    }

    // Handle file uploads if any
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      // Delete old photos from Cloudinary
      for (const photo of item.images) {
        if (photo.publicId) {
          await cloudinaryService.deleteFile(photo.publicId);
        }
      }

      // Upload new photos to Cloudinary with the correct folder
      const uploadPromises = req.files.map(async (file) => {
        return await cloudinaryService.uploadFile(
          file.buffer,
          file.mimetype,
          file.originalname,
          'delivered',
          item.flightNumber
        );
      });

      const newPhotos = await Promise.all(uploadPromises);
      item.images = newPhotos;
    }

    // Update other fields
    Object.assign(item, updates);
    await item.save();

    const updatedItem = await DeliveredItem.findById(req.params.id)
      .populate('foundBy', 'firstName lastName employeeNumber')
      .populate('deliveredBy', 'firstName lastName employeeNumber');

    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating delivered item:', error);
    res.status(500).json({ message: 'Error updating delivered item' });
  }
}) as RequestHandler);

// Delete a delivered item
router.delete('/:id', auth, hasAnyPermission(['delete_all_items', 'delete_own_items']), (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await DeliveredItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item entregado no encontrado' });
    }

    // Check permissions
    const isAdmin = req.user.role === 'admin';
    const hasDeleteAllPermission = req.user.permissions?.some(p => 
      p && matchesPermission(p, 'delete_all_items')
    );
    const isOwner = item.foundBy.toString() === req.user._id.toString();

    if (!isAdmin && !hasDeleteAllPermission && !isOwner) {
      return res.status(403).json({ 
        message: 'No tienes permiso para eliminar este item',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // Delete images from Cloudinary if they exist
    if (item.images && item.images.length > 0) {
      const deletePromises = item.images.map(async (image) => {
        if (image.publicId) {
          try {
            await cloudinaryService.deleteFile(image.publicId);
          } catch (error) {
            console.error(`Failed to delete image ${image.publicId} from Cloudinary:`, error);
          }
        }
      });
      await Promise.all(deletePromises);
    }

    // Delete the item from database
    await item.deleteOne();
    res.json({ message: 'Item eliminado exitosamente' });
  } catch (error) {
    console.error('Error deleting delivered item:', error);
    res.status(500).json({ 
      message: 'Error al eliminar el item', 
      error: error instanceof Error ? error.message : 'Un error desconocido ocurrió' 
    });
  }
}) as RequestHandler);

// Revert delivered item to on hand (admin only)
router.post('/:id/revert', auth, hasPermission('admin'), (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deliveredItem = await DeliveredItem.findById(req.params.id);
    if (!deliveredItem) {
      return res.status(404).json({ message: 'Delivered item not found' });
    }

    const newItem = new LostItem({
      flightNumber: deliveredItem.flightNumber,
      description: deliveredItem.description,
      location: deliveredItem.location,
      category: deliveredItem.category,
      photoUrl: deliveredItem.images?.[0]?.url || '',
      status: 'onHand',
      dateFound: deliveredItem.dateDelivered, 
      foundBy: req.user._id, 
    });

    try {
      await newItem.save();

      deliveredItem.archived = true;
      await deliveredItem.save();

      res.json({ message: 'Item reverted to on hand successfully', item: newItem });
    } catch (saveError: any) {
      if (saveError.name === 'ValidationError') {
        return res.status(400).json({
          message: 'Validation error',
          errors: Object.values(saveError.errors).map((err: any) => ({
            field: err.path,
            message: err.message
          }))
        });
      }
      throw saveError; 
    }
  } catch (error) {
    console.error('Error reverting delivered item:', error);
    res.status(500).json({ message: 'Error reverting delivered item' });
  }
}) as RequestHandler);

export default router;
