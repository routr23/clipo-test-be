const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  configKey: {
    type: String,
    required: true,
    unique: true,
    default: 'global'
  },
  notificationText: {
    type: String,
    default: ''
  },
  isNotificationActive: {
    type: Boolean,
    default: false
  },
  notificationTargetUrl: {
    type: String,
    default: ''
  },
  notificationUpdatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
