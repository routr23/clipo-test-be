const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
require('node:dns').setDefaultResultOrder('ipv4first');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const feedbackRoutes = require('./routes/feedback');

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://clipo.netlify.app',
    'https://clipo-xyz.netlify.app',
    'capacitor://localhost',
    'http://localhost',
    /\.netlify\.app$/
  ],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/public', publicRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Clipo API running' });
});

app.get('/api/chat', (req, res) => {
  res.json({ status: 'ok', message: 'Clipo endpoint is working' });
});

app.get('/api/feedback', (req, res) => {
  res.json({ status: 'ok', message: 'Feedback endpoint is working' });
});

app.get('/api/admin', (req, res) => {
  res.json({ status: 'ok', message: 'Admin endpoint is working' });
});

// Connect to MongoDB
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/clipo';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;

// Export the app for Vercel
module.exports = app;
