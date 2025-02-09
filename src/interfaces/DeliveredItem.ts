import { ILostItem } from '../models/LostItem';
import { DeliveryData } from '../types/DeliveryData';
import { Types } from 'mongoose';

export type DeliveredItem = {
  _id: Types.ObjectId;
  category: string;
  deliveryInfo?: DeliveryData;
  deliveredAt: Date;
  deliveredBy: Types.ObjectId;
  location: string;
  photoUrl: string;
  archived?: boolean;
  flightNumber: string;
  dateFound: Date;
  description: string;
  images: Array<{
    publicId: string;
    url: string;
    thumbnailUrl?: string;
  }>;
  status: 'delivered';
  customerInfo?: {
    name: string;
    lastName: string;
    signature: string;
    deliveryDate: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}
