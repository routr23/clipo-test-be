const express = require('express');
const crypto = require('crypto');
const ChatSession = require('../models/ChatSession');
const authMiddleware = require('../middleware/auth');
const { getSearchContext, needsSearch } = require('../utils/tavily');

const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1';
const MODEL = process.env.MODEL || 'openai/gpt-4o-mini';

async function generateSmartTitle(content) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that generates short, descriptive titles for chat conversations. Return ONLY the title (3-5 words max), no quotes, no periods, no extra text.' },
          { role: 'user', content: `Summarize this message into a 3-5 word title: "${content}"` }
        ],
        max_tokens: 20
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim();
  } catch (err) {
    console.error('Title generation error:', err);
    return null;
  }
}


const router = express.Router();

// All chat routes require auth
router.use(authMiddleware);

// GET /api/chat/sessions/stats - Get user's chat statistics without loading full documents
router.get('/sessions/stats', async (req, res) => {
  try {
    const defaultStats = { totalSessions: 0, totalMessages: 0 };
    const stats = await ChatSession.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalMessages: { $sum: { $size: { $ifNull: ["$messages", []] } } }
        }
      }
    ]);
    res.json(stats[0] || defaultStats);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ message: 'Failed to fetch overall stats' });
  }
});

// GET /api/chat/sessions — list sessions for user with pagination and search
router.get('/sessions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    // Build the query
    const matchQuery = { userId: req.user._id };
    if (search) {
      matchQuery.title = { $regex: search, $options: 'i' };
    }

    const sessions = await ChatSession.aggregate([
      { $match: matchQuery },
      { $sort: { updatedAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          subject: 1,
          title: 1,
          createdAt: 1,
          updatedAt: 1,
          messageCount: { $size: { $ifNull: ["$messages", []] } },
          lastMessage: {
            $let: {
              vars: { lastMsg: { $arrayElemAt: ["$messages", -1] } },
              in: { $substrCP: ["$$lastMsg.content", 0, 100] }
            }
          }
        }
      }
    ]);

    const total = await ChatSession.countDocuments(matchQuery);

    // Format is already mostly correct due to projection
    const formatted = sessions.map(s => ({
      ...s,
      lastMessage: s.lastMessage || ''
    }));

    res.json({
      sessions: formatted,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
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
        // Simple fallback title first
        session.title = firstUser.content.substring(0, 40) + (firstUser.content.length > 40 ? '...' : '');

        // Await the smart title generation for the first message to prevent race conditions
        try {
          const smartTitle = await generateSmartTitle(firstUser.content);
          if (smartTitle) {
            session.title = smartTitle;
          }
        } catch (err) {
          console.error('Failed to generate smart title:', err);
        }
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

// POST /api/chat/sessions/:id/share — Generate or toggle public share link
router.post('/sessions/:id/share', async (req, res) => {
  try {
    const session = await ChatSession.findOne({ _id: req.params.id, userId: req.user._id });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (!session.shareId) {
      session.shareId = crypto.randomBytes(8).toString('hex');
    }

    if (typeof req.body.isPublic === 'boolean') {
      session.isPublic = req.body.isPublic;
    } else {
      session.isPublic = true;
    }

    await session.save();

    res.json({
      shareId: session.shareId,
      isPublic: session.isPublic,
      shareUrl: `/share/${session.shareId}`
    });
  } catch (err) {
    console.error('Share error:', err);
    res.status(500).json({ message: 'Failed to share session' });
  }
});

// POST /api/chat/stream — proxy OpenRouter streaming
router.post('/stream', async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: 'Server missing API key' });
    }

    console.log('--- AI STREAM START ---');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // --- Tavily Web Search Integration ---
    let finalSystemPrompt = systemPrompt || 'You are a helpful AI assistant.';
    const lastUserMessage = messages && messages.length > 0 ? messages.filter(m => m.role === 'user').pop() : null;
    let sources = [];

    if (lastUserMessage && needsSearch(lastUserMessage.content)) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'status', message: 'Searching the web...' })}\n\n`);
        const searchData = await getSearchContext(lastUserMessage.content);

        res.write(`data: ${JSON.stringify({ type: 'status', message: 'Analyzing research...' })}\n\n`);
        finalSystemPrompt = `${finalSystemPrompt}\n\n${searchData.context}\n\nCRITICAL INSTRUCTION: You are provided with real-time web search results above. You must ONLY provide links/URLs that explicitly appear in these results. NEVER hallucinate, guess, or make up a URL. If you cannot find an exact, working link in the results, admit that you do not have the link. When you cite a source from the results, use the format: <a href="URL" target="_blank"><cite>Source Name</cite></a>.`;
        sources = searchData.results;

        // Send sources
        if (sources.length > 0) {
          res.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`);
        }
      } catch (err) {
        console.error('Tavily search skipped/failed:', err);
      }
    }

    // Clear status before AI starts
    res.write(`data: ${JSON.stringify({ type: 'status', message: '' })}\n\n`);
    // -------------------------------------

    const aiResponse = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [
          { role: 'system', content: finalSystemPrompt },
          ...messages.map(m => {
            const isVisionModel = (
              MODEL.toLowerCase().includes('vision') ||
              MODEL.toLowerCase().includes('gpt-4o') ||
              MODEL.toLowerCase().includes('claude-3') ||
              MODEL.toLowerCase().includes('gemini') ||
              MODEL.toLowerCase().includes('pixtral')
            );

            // Only send images in vision format if model supports it
            if (m.imageUrl && isVisionModel) {
              return {
                role: m.role,
                content: [
                  { type: 'text', text: m.content || 'What is in this image?' },
                  { type: 'image_url', image_url: { url: m.imageUrl } }
                ]
              };
            }
            return { role: m.role, content: m.content || '' };
          })
        ],
        max_tokens: 4096,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('--- AI PROVIDER ERROR ---');
      console.error('Status:', aiResponse.status);
      console.error('Details:', errorText);

      if (!res.headersSent) {
        try {
          const errJson = JSON.parse(errorText);
          return res.status(aiResponse.status).json(errJson);
        } catch (e) {
          return res.status(aiResponse.status).json({
            message: `AI Provider Error: ${aiResponse.status}`,
            details: errorText
          });
        }
      } else {
        res.write(`data: ${JSON.stringify({ error: `AI provider error (${aiResponse.status})` })}\n\n`);
        res.end();
        return;
      }
    }

    // Proxy the stream
    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      res.write(chunk);
    }
    res.end();
    console.log('--- AI STREAM END ---');

  } catch (err) {
    console.error('Stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to stream response', details: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.name === 'TimeoutError' ? 'Connection timed out. Please try again.' : 'Network error occurred.' })}\n\n`);
      res.end();
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
