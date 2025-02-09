import { Types } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: Types.ObjectId;
        employeeNumber: string;
        firstName: string;
        lastName: string;
        role: string;
        permissions: string[];
        createdAt: Date;
        updatedAt: Date;
      };
      token?: string;
    }

    namespace Multer {
      interface File {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        destination: string;
        filename: string;
        path: string;
        buffer: Buffer;
      }
    }
  }
}
