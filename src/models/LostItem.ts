import mongoose, { Schema, Document } from 'mongoose';

export interface ILostItem extends Document {
  itemName: string;
  description: string;
  location: string;
  category: string;
  status: 'pending' | 'delivered' | 'archived';
  images: string[];
  reportedBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LostItemSchema = new Schema({
  itemName: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'delivered', 'archived'],
    default: 'pending',
  },
  images: [{
    type: String,
  }],
  reportedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

// Ensure reportedBy is always populated
LostItemSchema.pre('find', function() {
  this.populate('reportedBy');
});

LostItemSchema.pre('findOne', function() {
  this.populate('reportedBy');
});

export default mongoose.model<ILostItem>('LostItem', LostItemSchema);
