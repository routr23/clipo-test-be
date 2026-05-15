const express = require('express');
const ChatSession = require('../models/ChatSession');

const router = express.Router();

// GET /api/public/chat/:shareId — Get a read-only public chat
router.get('/chat/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    
    // Find chat session that matches shareId and is marked public
    const session = await ChatSession.findOne({ shareId, isPublic: true })
      .populate('userId', 'name') // Optionally populate the creator's name
      .lean();

    if (!session) {
      return res.status(404).json({ message: 'Chat session not found or is private' });
    }

    // Strip sensitive IDs or internal metadata we don't want to expose
    const safeSession = {
      _id: session._id,
      title: session.title,
      subject: session.subject,
      messages: session.messages,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      creatorName: session.userId?.name || 'Anonymous'
    };

    res.json({ session: safeSession });
  } catch (err) {
    console.error('Public chat fetch error:', err);
    res.status(500).json({ message: 'Error fetching shared chat' });
  }
});

module.exports = router;
