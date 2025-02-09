import mongoose, { Schema, Document } from 'mongoose';
import { ILostItem } from './LostItem';

export interface IDeliveredItem extends Document {
  lostItem: ILostItem['_id'];
  deliveredBy: Schema.Types.ObjectId;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  signature: string;
  deliveryDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeliveredItemSchema = new Schema({
  lostItem: {
    type: Schema.Types.ObjectId,
    ref: 'LostItem',
    required: true,
  },
  deliveredBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  customerPhone: {
    type: String,
    required: true,
  },
  customerEmail: {
    type: String,
    required: true,
  },
  signature: {
    type: String,
    required: true,
  },
  deliveryDate: {
    type: Date,
    default: Date.now,
  },
  notes: {
    type: String,
  },
}, {
  timestamps: true,
});

// Ensure references are always populated
DeliveredItemSchema.pre('find', function() {
  this.populate('lostItem').populate('deliveredBy');
});

DeliveredItemSchema.pre('findOne', function() {
  this.populate('lostItem').populate('deliveredBy');
});

export default mongoose.model<IDeliveredItem>('DeliveredItem', DeliveredItemSchema);
