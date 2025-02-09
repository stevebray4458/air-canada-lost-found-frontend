import cloudinary from '../config/cloudinary';
import { UploadApiResponse } from 'cloudinary';

export const uploadToCloudinary = async (
  file: Express.Multer.File
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'lost-and-found',
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result!);
      }
    );

    uploadStream.end(file.buffer);
  });
};

export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    throw error;
  }
};
