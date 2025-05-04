const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate requests using API key
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const apiKeyAuth = (req, res, next) => {
  try {
    // Get API key from request header
    const apiKey = req.headers['x-api-key'];
    
    // Check if API key exists
    if (!apiKey) {
      logger.warn('API request missing API key');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    // Validate API key using timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(apiKey),
      Buffer.from(process.env.API_KEY || '')
    );
    
    if (!isValid) {
      logger.warn(`Invalid API key attempt from IP: ${req.ip}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Add a timestamp to the request to track when it was authenticated
    req.authenticatedAt = Date.now();
    
    next();
  } catch (error) {
    // For timing-safe comparison errors (different length strings)
    logger.error('API key authentication error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

module.exports = apiKeyAuth;