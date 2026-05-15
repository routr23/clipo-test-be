const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String
  },
  imageUrl: {
    type: String
  },
  sources: [{
    title: String,
    url: String,
    content: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const chatSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subject: {
    type: String,
    required: true,
    default: 'General'
  },
  title: {
    type: String,
    default: 'New Chat'
  },
  messages: [messageSchema],
  isPublic: {
    type: Boolean,
    default: false
  },
  shareId: {
    type: String,
    unique: true,
    sparse: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp on save
chatSessionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  // Auto-set title from first user message
  if (this.messages.length > 0 && this.title === 'New Chat') {
    const firstUser = this.messages.find(m => m.role === 'user');
    if (firstUser) {
      this.title = firstUser.content.substring(0, 60) + (firstUser.content.length > 60 ? '...' : '');
    }
  }
  next();
});

module.exports = mongoose.model('ChatSession', chatSessionSchema);
