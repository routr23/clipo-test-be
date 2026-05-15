const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ChatSession = require('../models/ChatSession');
const SystemConfig = require('../models/SystemConfig');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '7d' }
  );
};

// PUBLIC: Admin login via fixed security key
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body; // 'password' field is used for security key
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and Security Key are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase(), role: 'admin' });
    
    if (!user || user.adminSecurityKey !== password) {
      return res.status(401).json({ message: 'Invalid Admin credentials or restricted access.' });
    }

    const token = generateToken(user._id);

    res.json({
      message: 'Admin access granted',
      token,
      user: user.toJSON()
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ message: 'Server error during admin login' });
  }
});

// PUBLIC: Get system config (for notification banner)
router.get('/config', async (req, res) => {
  try {
    let config = await SystemConfig.findOne({ configKey: 'global' });
    if (!config) {
      config = await SystemConfig.create({ configKey: 'global' });
    }
    res.json({ config });
  } catch (err) {
    console.error('Get config error:', err);
    res.status(500).json({ message: 'Failed to fetch config' });
  }
});

// PROTECTED: Higher-level admin routes
router.use(auth, adminAuth);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalSessions = await ChatSession.countDocuments();
    
    const messageStats = await ChatSession.aggregate([
      { $project: { count: { $size: '$messages' } } },
      { $group: { _id: null, total: { $sum: '$count' } } }
    ]);
    const totalMessages = messageStats.length > 0 ? messageStats[0].total : 0;

    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select('name email createdAt');

    res.json({
      stats: {
        totalUsers,
        totalSessions,
        totalMessages,
      },
      recentUsers
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ message: 'Failed to fetch admin stats' });
  }
});

// POST /api/admin/users - Create new user
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: role || 'user'
    });

    res.status(201).json({
      message: 'User created successfully',
      user: newUser.toJSON()
    });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).select('-password');
    res.json({ users });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// PATCH /api/admin/users/:id - Update user details
router.patch('/users/:id', async (req, res) => {
  try {
    const { name, email, role } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, role },
      { new: true }
    ).select('-password');
    
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User updated successfully', user });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

// DELETE /api/admin/users/:id - Delete user and all their chats
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Delete associated chat sessions
    await ChatSession.deleteMany({ userId });

    res.json({ message: 'User and associated data deleted successfully' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

// PATCH /api/admin/config - Update global config
router.patch('/config', async (req, res) => {
  try {
    const { notificationText, isNotificationActive, notificationTargetUrl } = req.body;
    
    const config = await SystemConfig.findOneAndUpdate(
      { configKey: 'global' },
      { 
        notificationText, 
        isNotificationActive,
        notificationTargetUrl,
        notificationUpdatedAt: Date.now()
      },
      { new: true, upsert: true }
    );

    res.json({ message: 'Configuration updated successfully', config });
  } catch (err) {
    console.error('Update config error:', err);
    res.status(500).json({ message: 'Failed to update configuration' });
  }
});

module.exports = router;
