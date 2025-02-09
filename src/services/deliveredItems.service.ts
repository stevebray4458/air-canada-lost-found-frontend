import { DeliveredItem } from '../interfaces/DeliveredItem';
import LostItemModel, { ILostItem } from '../models/LostItem';
import { DeliveryData } from '../types/DeliveryData';
import mongoose, { Types, Document } from 'mongoose';

class DeliveredItemsService {
  async markAsDelivered(
    item: ILostItem,
    deliveryInfo: DeliveryData,
    userId: string
  ): Promise<string> {
    try {
      const deliveredItem = {
        ...item.toObject(),
        deliveryInfo,
        deliveredAt: new Date(),
        deliveredBy: new Types.ObjectId(userId),
        status: 'delivered'
      };

      const updatedItem = await LostItemModel.findByIdAndUpdate<Document & ILostItem>(
        item._id,
        deliveredItem,
        { new: true, runValidators: true }
      );

      if (!updatedItem) {
        throw new Error('Failed to update item');
      }

      return (updatedItem._id as unknown as Types.ObjectId).toString();
    } catch (error) {
      console.error('Error in markAsDelivered:', error);
      throw error;
    }
  }

  async getDeliveredItems(): Promise<DeliveredItem[]> {
    try {
      const items = await LostItemModel.find({ 
        status: 'delivered',
        deliveredBy: { $exists: true } // Only get items that have deliveredBy field
      })
        .populate('deliveredBy', 'name')
        .sort({ deliveredAt: -1 });
      
      return items.map(item => {
        const obj = item.toObject();
        if (!obj.deliveredBy) {
          throw new Error('Delivered item missing deliveredBy field');
        }
        return {
          ...obj,
          _id: item._id,
          photoUrl: item.images[0]?.url || '', // Use the first image URL as photoUrl
          deliveredAt: item.customerInfo?.deliveryDate || item.updatedAt, // Use delivery date or fallback to updatedAt
          deliveredBy: obj.deliveredBy // This is now guaranteed to exist
        } as DeliveredItem;
      });
    } catch (error) {
      console.error('Error in getDeliveredItems:', error);
      throw error;
    }
  }
}

export default new DeliveredItemsService();
