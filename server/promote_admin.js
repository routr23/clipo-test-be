const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/clipo';

// --- CONFIGURATION ---
const REGISTERED_ADMIN_EMAIL = 'routrvaishnav@gmail.com';
const FIXED_ADMIN_KEY = 'clipo_admin_vaishnav'; 
// ---------------------

async function promote() {
  try {
    await mongoose.connect(MONGO_URI);
    
    const user = await User.findOneAndUpdate(
      { email: REGISTERED_ADMIN_EMAIL },
      { 
        role: 'admin',
        adminSecurityKey: FIXED_ADMIN_KEY
      },
      { new: true }
    );

    if (user) {
      console.log('---------------------------------------------------------');
      console.log(`✅ Success: ${user.name} promoted to Admin.`);
      console.log(`📧 Registered Email: ${REGISTERED_ADMIN_EMAIL}`);
      console.log(`🔑 Fixed Security Key: ${FIXED_ADMIN_KEY}`);
      console.log('---------------------------------------------------------');
      console.log('Only this email and key can access http://localhost:5173/admin/login');
    } else {
      console.log(`❌ Error: User ${REGISTERED_ADMIN_EMAIL} not found. Register first!`);
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  }
}
promote();
