const mongoose = require('mongoose');
const { DATABASE_CONFIG } = require('../config/constants');
const validator = require('validator');

/**
 * Schema for waitlist entries containing only email addresses
 * Uses custom collection name from environment variable
 */
const waitlistSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email address is required'],
    unique: true, // This already creates an index
    trim: true,
    lowercase: true,
    maxlength: [254, 'Email address cannot exceed 254 characters'],
    validate: {
      validator: function(value) {
        return validator.isEmail(value);
      },
      message: 'Please provide a valid email address'
    }
  }
}, { 
  timestamps: true,
  collection: DATABASE_CONFIG.COLLECTIONS.WAITLIST
});

module.exports = mongoose.model('Waitlist', waitlistSchema);