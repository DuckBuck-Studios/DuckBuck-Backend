const Message = require('../models/message.model');
const logger = require('../utils/logger');

/**
 * Submit a new contact message
 * @route POST /api/contact/submit
 * @access Public
 */
exports.submitMessage = async (req, res, next) => {
  try {
    // Extract data from request
    const { name, email, message } = req.body;

    // Basic validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email and message'
      });
    }

    // Length validation
    if (message.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Message must be at least 10 characters'
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot exceed 2000 characters'
      });
    }

    // Check if email already exists
    const existingMessage = await Message.findOne({ email: email.toLowerCase().trim() });
    if (existingMessage) {
      logger.info(`Repeated message attempt from email: ${email}`);
      return res.status(409).json({
        success: false,
        message: 'We already received your message. Thank you for your interest!'
      });
    }

    // Create new message
    const newMessage = new Message({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      message: message.trim()
    });

    // Save to database
    await newMessage.save();

    logger.info(`New message received from: ${email}`);

    // Return success
    return res.status(201).json({
      success: true,
      message: 'Your message has been received. Thank you for contacting us!'
    });
  } catch (error) {
    logger.error(`Error submitting contact message: ${error.message}`, { stack: error.stack });
    return next(error);
  }
};