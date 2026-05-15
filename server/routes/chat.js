const express = require('express');
const ChatSession = require('../models/ChatSession');
const authMiddleware = require('../middleware/auth');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const router = express.Router();

// All chat routes require auth
router.use(authMiddleware);

// GET /api/chat/sessions — list all sessions for user
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await ChatSession.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .select('_id subject title createdAt updatedAt messages')
      .lean();

    // Return sessions with message count and last message preview
    const formatted = sessions.map(s => ({
      ...s,
      messageCount: s.messages.length,
      lastMessage: s.messages.length > 0 ? s.messages[s.messages.length - 1].content.substring(0, 100) : ''
    }));

    res.json({ sessions: formatted });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ message: 'Failed to fetch sessions' });
  }
});

// POST /api/chat/sessions — create new session
router.post('/sessions', async (req, res) => {
  try {
    const { subject = 'General', title = 'New Chat' } = req.body;

    const session = await ChatSession.create({
      userId: req.user._id,
      subject,
      title,
      messages: []
    });

    res.status(201).json({ session });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ message: 'Failed to create session' });
  }
});

// GET /api/chat/sessions/:id — get single session with all messages
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await ChatSession.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.json({ session });
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ message: 'Failed to fetch session' });
  }
});

// PUT /api/chat/sessions/:id — add messages to session
router.put('/sessions/:id', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ message: 'messages array is required' });
    }

    const session = await ChatSession.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    session.messages.push(...messages);

    // Auto-set title from first user message
    if (session.title === 'New Chat' && session.messages.length > 0) {
      const firstUser = session.messages.find(m => m.role === 'user');
      if (firstUser) {
        session.title = firstUser.content.substring(0, 60) + (firstUser.content.length > 60 ? '...' : '');
      }
    }

    await session.save();
    res.json({ session });
  } catch (err) {
    console.error('Update session error:', err);
    res.status(500).json({ message: 'Failed to update session' });
  }
});

// DELETE /api/chat/sessions/:id — delete a session
router.delete('/sessions/:id', async (req, res) => {
  try {
    const session = await ChatSession.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.json({ message: 'Session deleted' });
  } catch (err) {
    console.error('Delete session error:', err);
    res.status(500).json({ message: 'Failed to delete session' });
  }
});

// POST /api/chat/stream — proxy OpenRouter streaming
router.post('/stream', async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: 'Server missing OpenRouter API key' });
    }

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Clipo AI',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => {
            if (m.imageUrl) {
              return {
                role: m.role,
                content: [
                  { type: 'text', text: m.content },
                  { type: 'image_url', image_url: { url: m.imageUrl } }
                ]
              };
            }
            return { role: m.role, content: m.content };
          })
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json(err);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    console.error('Stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to stream response' });
    }
  }
});

// PATCH /api/chat/sessions/:id — rename a session
router.patch('/sessions/:id', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ message: 'Valid title is required' });
    }

    const session = await ChatSession.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { title },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.json({ session });
  } catch (err) {
    console.error('Rename session error:', err);
    res.status(500).json({ message: 'Failed to rename session' });
  }
});

module.exports = router;
