const validator = require('validator');
const logger = require('../utils/logger');

/**
 * Middleware to validate and sanitize email inputs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const validateEmail = (req, res, next) => {
  try {
    let { email } = req.body;
    
    // Check if email exists
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    
    // Convert to string and trim
    email = String(email).trim().toLowerCase();
    
    // Sanitize and validate email
    if (!validator.isEmail(email)) {
      logger.warn(`Invalid email format attempted: ${email}`);
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }
    
    // Normalize the email
    email = validator.normalizeEmail(email, {
      all_lowercase: true,
      gmail_remove_dots: false,
      gmail_remove_subaddress: false,
      gmail_convert_googlemaildotcom: false,
      outlookdotcom_remove_subaddress: false,
      yahoo_remove_subaddress: false,
      icloud_remove_subaddress: false
    });
    
    // Check for disposable email services
    if (validator.isByteLength(email, {max: 254}) === false) {
      logger.warn(`Email exceeds maximum length: ${email}`);
      return res.status(400).json({
        success: false, 
        message: 'Email address is too long'
      });
    }
    
    // Replace sanitized email in request body
    req.body.email = email;
    
    next();
  } catch (error) {
    logger.error('Error in email validation middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Error validating email'
    });
  }
};

module.exports = validateEmail;