const mongoose = require('mongoose');
const { isEmail } = require('validator');

const messageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    validate: [isEmail, 'Please provide a valid email address']
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    minlength: [10, 'Message must be at least 10 characters long'],
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: process.env.MESSAGE_COLLECTION_NAME || 'messages'
});

// Index for searching and optimized lookups
messageSchema.index({ email: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;