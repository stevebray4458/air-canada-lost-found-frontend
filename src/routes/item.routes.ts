import express, { Request, Response, RequestHandler, NextFunction } from 'express';
import { auth, hasAnyPermission, matchesPermission, AuthenticatedRequest, AuthenticatedRequestHandler } from '../middleware/auth';
import { IPermission } from '../models/Permission';
import DeliveredItem from '../models/DeliveredItem';
import LostItem from '../models/LostItem';
import multer from 'multer';
import cloudinaryService from '../services/cloudinary.service';
import { Document, Types, ObjectId } from 'mongoose';

interface LostItemDocument extends Document {
  _id: Types.ObjectId;
  flightNumber: string;
  dateFound: Date;
  location: string;
  description: string;
  category: string;
  images: Array<{
    publicId: string;
    url: string;
    thumbnailUrl?: string;
  }>;
  status: 'onHand' | 'delivered' | 'inProcess';
  foundBy: {
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    employeeNumber: string;
  };
  supervisor?: {
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    employeeNumber: string;
  };
  deliveryInfo?: {
    receiverName: string;
    receiverPhone: string;
    receiverEmail: string;
    receiverIdentification: string;
    notes?: string;
    signature: string;
    deliveryDate: string;
  };
}

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all items
router.get('/', auth, (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    let query = {};
    
    // If user doesn't have view_all_items permission, only show items they found
    const permissions = req.user.permissions as IPermission[];
    if (!permissions.some(p => 
      p && matchesPermission(p, 'view_all_items')
    )) {
      query = { foundBy: req.user._id };
    }

    // Get non-delivered items
    const nonDeliveredQuery = { ...query, status: { $ne: 'delivered' } };
    const items = await LostItem.find(nonDeliveredQuery)
      .populate('foundBy', 'firstName lastName employeeNumber')
      .populate('supervisor', 'firstName lastName employeeNumber')
      .sort({ dateFound: -1 });

    // Get delivered items if user has permission
    let deliveredItems: LostItemDocument[] = [];
    if (permissions.some(p => 
      p && matchesPermission(p, 'view_delivered_items')
    )) {
      const deliveredQuery = { ...query, status: 'delivered' };
      let tempDeliveredItems = await LostItem.find(deliveredQuery)
        .populate('foundBy', 'firstName lastName employeeNumber')
        .populate('supervisor', 'firstName lastName employeeNumber')
        .sort({ dateFound: -1 });
      
      deliveredItems = tempDeliveredItems.map(item => {
        const itemObj = item.toObject();
        return {
          ...itemObj,
          images: itemObj.images || [], // Ensure images array exists
          foundBy: item.foundBy && typeof item.foundBy === 'object' && !('_id' in item.foundBy) 
            ? item.foundBy 
            : item.foundBy && typeof item.foundBy === 'object' 
              ? {
                  ...item.foundBy,
                  _id: new Types.ObjectId(item.foundBy._id.toString())
                }
              : item.foundBy,
          supervisor: item.supervisor && typeof item.supervisor === 'object' && !('_id' in item.supervisor)
            ? item.supervisor
            : item.supervisor && typeof item.supervisor === 'object'
              ? {
                  ...item.supervisor,
                  _id: new Types.ObjectId(item.supervisor._id.toString())
                }
              : item.supervisor
        };
      }) as unknown as LostItemDocument[];
    }

    // Combine and send all items
    const allItems = [...items, ...deliveredItems];
    res.json(allItems);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ 
      message: 'Error fetching items', 
      error: error instanceof Error ? error.message : 'An unknown error occurred' 
    });
  }
}) as AuthenticatedRequestHandler);

// Get single item
router.get('/:id', auth, (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const item = await LostItem.findById(req.params.id)
      .populate('foundBy', 'firstName lastName employeeNumber')
      .populate('supervisor', 'firstName lastName employeeNumber');
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ 
      message: 'Error fetching item', 
      error: error instanceof Error ? error.message : 'An unknown error occurred' 
    });
  }
}) as AuthenticatedRequestHandler);

// Create new item
router.post('/', auth, upload.array('images', 5), ((async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    console.log('Create item request received:', {
      body: req.body,
      files: req.files ? (req.files as Express.Multer.File[]).map(f => ({

      })) : []
    });
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ 
      message: 'Error creating item', 
      error: error instanceof Error ? error.message : 'An unknown error occurred' 
    });
  }
}) as AuthenticatedRequestHandler));

export = router;
