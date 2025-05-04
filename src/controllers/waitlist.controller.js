const Waitlist = require('../models/waitlist.model');
const logger = require('../utils/logger');

/**
 * Add email to waitlist
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with status
 */
const addToWaitlist = async (req, res, next) => {
  try {
    const { email } = req.body;

    // This should already be validated by the middleware,
    // but we add another check as a safety measure
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if email already exists using lean() for better performance
    const existingEmail = await Waitlist.findOne({ email }).lean().exec();
    if (existingEmail) {
      // Don't reveal that email exists for security reasons in production
      if (process.env.NODE_ENV === 'production') {
        logger.info(`Duplicate email signup attempt: ${email}`);
        return res.status(200).json({
          success: true,
          message: 'Thank you for your interest' 
        });
      } else {
        return res.status(409).json({
          success: false,
          message: 'Email is already on the waitlist'
        });
      }
    }

    // Create new waitlist entry with just the email
    const waitlistEntry = new Waitlist({ email });
    
    // Save the email to the database
    await waitlistEntry.save();

    // Log success but mask part of the email for privacy
    const maskedEmail = `${email.substring(0, 3)}...${email.slice(-4)}`;
    logger.info(`New signup added to waitlist: ${maskedEmail}`);
    
    return res.status(201).json({
      success: true,
      message: 'Successfully added to waitlist',
    });
  } catch (error) {
    logger.error(`Error in waitlist signup: ${error.message}`, { stack: error.stack });

    // Check for validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Check for MongoDB duplicate key error (code 11000)
    if (error.code === 11000) {
      // Don't reveal that email exists for security reasons in production
      if (process.env.NODE_ENV === 'production') {
        return res.status(200).json({
          success: true,
          message: 'Thank you for your interest'
        });
      } else {
        return res.status(409).json({
          success: false,
          message: 'Email is already on the waitlist'
        });
      }
    }

    // If this is a database/network error, pass to global error handler
    return next(error);
  }
};

module.exports = {
  addToWaitlist
};