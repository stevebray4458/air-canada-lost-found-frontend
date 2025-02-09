import mongoose from 'mongoose';
import Permission from '../models/Permission';
import dotenv from 'dotenv';

dotenv.config();

const PERMISSIONS = [
  { name: 'view_dashboard', description: 'View the dashboard', component: 'dashboard', action: 'view' },
  { name: 'view_all_items', description: 'View all lost and found items', component: 'items', action: 'view_all' },
  { name: 'view_own_items', description: 'View items you created', component: 'items', action: 'view_own' },
  { name: 'create_items', description: 'Create new lost and found items', component: 'items', action: 'create' },
  { name: 'edit_all_items', description: 'Edit any lost and found item', component: 'items', action: 'edit_all' },
  { name: 'edit_own_items', description: 'Edit items you created', component: 'items', action: 'edit_own' },
  { name: 'delete_all_items', description: 'Delete any lost and found item', component: 'items', action: 'delete_all' },
  { name: 'delete_own_items', description: 'Delete items you created', component: 'items', action: 'delete_own' },
  { name: 'manage_users', description: 'Manage system users', component: 'users', action: 'manage' },
  { name: 'generate_reports', description: 'Generate system reports', component: 'reports', action: 'generate' },
  { name: 'deliver_items', description: 'Mark items as delivered', component: 'items', action: 'deliver' },
  { name: 'view_delivered_items', description: 'View delivered items', component: 'items', action: 'view_delivered' },
  { name: 'revert_delivered_status', description: 'Revert delivered status of items', component: 'items', action: 'revert_delivered' }
];

async function initializePermissions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lof');
    console.log('Connected to MongoDB successfully');

    console.log('Initializing permissions...');
    
    // Create permissions if they don't exist
    for (const permission of PERMISSIONS) {
      const existingPermission = await Permission.findOne({ name: permission.name });
      if (!existingPermission) {
        await Permission.create(permission);
        console.log(`Created permission: ${permission.name}`);
      } else {
        // Update description if it has changed
        if (existingPermission.description !== permission.description) {
          await Permission.updateOne(
            { _id: existingPermission._id },
            { $set: { description: permission.description } }
          );
          console.log(`Updated permission description: ${permission.name}`);
        }
      }
    }

    // Remove any permissions that are no longer needed
    const existingPermissions = await Permission.find();
    for (const existingPermission of existingPermissions) {
      if (!PERMISSIONS.some(p => p.name === existingPermission.name)) {
        await Permission.deleteOne({ _id: existingPermission._id });
        console.log(`Removed deprecated permission: ${existingPermission.name}`);
      }
    }

    console.log('Permission initialization completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error initializing permissions:', error);
    process.exit(1);
  }
}

initializePermissions();
