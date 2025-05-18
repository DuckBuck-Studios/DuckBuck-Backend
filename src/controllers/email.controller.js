const emailService = require('../services/email.service');
const logger = require('../utils/logger');

// Email validation regex - basic validation with reasonable complexity
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Username validation regex - alphanumeric plus some common characters, reasonable length
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,50}$/;

// Validate email format
const isValidEmail = (email) => {
  return typeof email === 'string' && 
         email.length <= 254 && // Max email length per RFC
         EMAIL_REGEX.test(email);
};

// Validate username format - prevent injection attacks and ensure reasonable input
const isValidUsername = (username) => {
  return typeof username === 'string' && 
         username.length <= 50 && // Reasonable max length
         username.length >= 3 &&  // Reasonable min length
         USERNAME_REGEX.test(username);
};

exports.sendWelcomeEmailHandler = async (req, res) => {
  try {
    const { email, username } = req.body;
    
    // Comprehensive input validation
    if (!email || !username) {
      logger.warn(`Send welcome email request missing required fields. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Email and username are required.' });
    }
    
    // Validate email format
    if (!isValidEmail(email)) {
      logger.warn(`Invalid email format in welcome email request: ${email}. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }

    // Validate username format
    if (!isValidUsername(username)) {
      logger.warn(`Invalid username format in welcome email request: ${username}. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Invalid username format.' });
    }
    
    // Authorization check: Ensure the email belongs to the authenticated user
    // This prevents users from sending emails on behalf of others
    if (req.user && req.user.email && req.user.email !== email) {
      logger.warn(`Unauthorized attempt to send welcome email to ${email} by user ${req.user.uid}. IP: ${req.ip}`);
      return res.status(403).json({ 
        success: false, 
        message: 'You can only send emails to your own email address.' 
      });
    }
    
    // Send the email
    await emailService.sendWelcomeEmail(req, email, username);
    
    // In production, don't expose too much information in the response
    res.status(200).json({ 
      success: true, 
      message: process.env.NODE_ENV === 'production' ? 
        'Welcome email sent successfully.' : 
        `Welcome email sent to ${email} successfully.` 
    });
  } catch (error) {
    logger.error('Error in sendWelcomeEmailHandler:', error);
    
    // Don't expose internal error details in production
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send welcome email.',
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
    });
  }
};

exports.sendLoginNotificationHandler = async (req, res) => {
  try {
    const { email, username, loginTime } = req.body;
    
    // Comprehensive input validation
    if (!email || !username) {
      logger.warn(`Send login notification request missing required fields. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Email and username are required.' });
    }
    
    // Validate email format
    if (!isValidEmail(email)) {
      logger.warn(`Invalid email format in login notification request: ${email}. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }

    // Validate username format
    if (!isValidUsername(username)) {
      logger.warn(`Invalid username format in login notification request: ${username}. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Invalid username format.' });
    }
    
    // Optional loginTime validation if provided
    if (loginTime && (typeof loginTime !== 'string' || loginTime.length > 100)) {
      logger.warn(`Invalid loginTime format in request: ${loginTime}. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Invalid loginTime format.' });
    }
    
    // Format timestamp nicely if it appears to be in ISO or standard format
    if (loginTime && loginTime.match(/^\d{4}-\d{2}-\d{2}/) || loginTime.match(/^\d{4}\/\d{2}\/\d{2}/)) {
      try {
        const date = new Date(loginTime);
        if (!isNaN(date)) {
          loginTime = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
        }
      } catch (e) {
        // Keep the original format if parsing fails
      }
    }
    
    // Authorization check: Ensure the email belongs to the authenticated user
    if (req.user && req.user.email && req.user.email !== email) {
      logger.warn(`Unauthorized attempt to send login notification to ${email} by user ${req.user.uid}. IP: ${req.ip}`);
      return res.status(403).json({ 
        success: false, 
        message: 'You can only send emails to your own email address.' 
      });
    }
    
    // Send the login notification email
    await emailService.sendLoginNotification(req, email, username, loginTime);
    
    // In production, don't expose too much information in the response
    res.status(200).json({ 
      success: true, 
      message: process.env.NODE_ENV === 'production' ? 
        'Login notification email sent successfully.' : 
        `Login notification email sent to ${email} successfully.` 
    });
  } catch (error) {
    logger.error('Error in sendLoginNotificationHandler:', error);
    
    // Don't expose internal error details in production
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send login notification email.',
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
    });
  }
};