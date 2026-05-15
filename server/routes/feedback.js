const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// POST /api/feedback - Submit feedback (Authenticated)
router.post('/', auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    
    if (!rating || !comment) {
      return res.status(400).json({ message: 'Rating and comment are required' });
    }

    const feedback = await Feedback.create({
      userId: req.user._id,
      name: req.user.name,
      rating,
      comment
    });

    res.status(201).json({ message: 'Feedback submitted successfully', feedback });
  } catch (err) {
    console.error('Submit feedback error:', err);
    res.status(500).json({ message: 'Failed to submit feedback' });
  }
});

// GET /api/feedback/stats - Get average rating (Public)
router.get('/stats', async (req, res) => {
  try {
    const stats = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalFeedback: { $sum: 1 }
        }
      }
    ]);

    const result = stats.length > 0 ? {
      averageRating: parseFloat(stats[0].averageRating.toFixed(1)),
      totalFeedback: stats[0].totalFeedback
    } : { averageRating: 0, totalFeedback: 0 };

    res.json(result);
  } catch (err) {
    console.error('Feedback stats error:', err);
    res.status(500).json({ message: 'Failed to fetch feedback stats' });
  }
});

// GET /api/feedback - Get all feedback (Admin only)
router.get('/', auth, adminAuth, async (req, res) => {
  try {
    const feedbackList = await Feedback.find().sort({ createdAt: -1 }).populate('userId', 'name email');
    res.json({ feedbackList });
  } catch (err) {
    console.error('Admin feedback list error:', err);
    res.status(500).json({ message: 'Failed to fetch feedback list' });
  }
});

module.exports = router;
