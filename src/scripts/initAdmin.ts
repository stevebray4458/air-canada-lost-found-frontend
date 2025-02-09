import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lost-and-found';

async function createAdminUser() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Delete existing admin if exists
    await User.deleteOne({ employeeNumber: 'AC000001' });
    console.log('Deleted existing admin user if any');

    // Create admin user
    const password = 'MRwill88**';
    console.log('Creating admin user with password:', password);
    
    const adminUser = new User({
      employeeNumber: 'AC000001',
      password: password,  // Plain password, will be hashed by pre-save middleware
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      permissions: [
        'view_items',
        'create_items',
        'edit_items',
        'delete_items',
        'manage_users',
        'generate_reports',
        'upload_files',
        'view_analytics',
        'manage_settings'
      ]
    });

    await adminUser.save();
    console.log('Admin user created successfully');

    // Verify the password hash
    const savedUser = await User.findOne({ employeeNumber: 'AC000001' });
    if (savedUser) {
      console.log('Testing password comparison with saved user');
      const isMatch = await savedUser.comparePassword(password);
      console.log('Verifying password hash - Match result:', isMatch);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();
