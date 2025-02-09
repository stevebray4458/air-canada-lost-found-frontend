import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

class CloudinaryService {
  async uploadFile(buffer: Buffer, mimeType: string, filename: string, type: 'lost' | 'delivered' = 'lost', flightNumber?: string) {
    try {
      // Convert buffer to base64
      const base64 = buffer.toString('base64');
      const dataURI = `data:${mimeType};base64,${base64}`;

      // Get current date in YYYY-MM-DD format
      const currentDate = new Date().toISOString().split('T')[0];
      
      // Determine base folder and subfolder structure
      const baseFolder = type === 'lost' ? 'Lost-items' : 'Delivered-items';
      const subFolder = flightNumber ? `${currentDate}/${flightNumber}` : currentDate;
      const folder = `${baseFolder}/${subFolder}`;

      // Upload to Cloudinary with organized folder structure
      const result = await cloudinary.uploader.upload(dataURI, {
        public_id: filename.replace(/\.[^/.]+$/, ''), // Remove file extension
        resource_type: 'auto',
        folder: folder
      });

      return {
        publicId: result.public_id,
        url: result.secure_url,
        thumbnailUrl: result.secure_url.replace('/upload/', '/upload/w_200/')
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw error;
    }
  }

  async moveToDelivered(publicId: string, flightNumber?: string) {
    try {
      // Extract only the base filename without any path
      const parts = publicId.split('/');
      const filename = parts[parts.length - 1];
      
      // Get current date in YYYY-MM-DD format
      const currentDate = new Date().toISOString().split('T')[0];
      
      // Construct new folder path
      const newFolder = `Delivered-items/${currentDate}${flightNumber ? `/${flightNumber}` : ''}`;
      
      // Move the file to the new folder
      const result = await cloudinary.uploader.rename(publicId, `${newFolder}/${filename}`, {
        overwrite: true,
        invalidate: true
      });

      return {
        publicId: result.public_id,
        url: result.secure_url,
        thumbnailUrl: result.secure_url.replace('/upload/', '/upload/w_200/')
      };
    } catch (error) {
      console.error('Error moving file to delivered folder:', error);
      throw error;
    }
  }

  async moveToLostItems(publicId: string, flightNumber: string) {
    try {
      // Extract only the base filename without any path
      const parts = publicId.split('/');
      const filename = parts[parts.length - 1];
      
      // Get current date in YYYY-MM-DD format
      const currentDate = new Date().toISOString().split('T')[0];
      
      // Construct new folder path in Lost-items
      const newFolder = `Lost-items/${currentDate}/${flightNumber}`;
      
      // Move the file to the Lost-items folder
      const result = await cloudinary.uploader.rename(publicId, `${newFolder}/${filename}`, {
        overwrite: true,
        invalidate: true
      });

      return {
        publicId: result.public_id,
        url: result.secure_url,
        thumbnailUrl: result.secure_url.replace('/upload/', '/upload/w_200/')
      };
    } catch (error) {
      console.error('Error moving file to lost items folder:', error);
      throw error;
    }
  }

  async deleteFile(publicId: string) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw error;
    }
  }
}

export default new CloudinaryService();
