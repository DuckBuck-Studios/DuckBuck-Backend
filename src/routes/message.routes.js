const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { submitMessage } = require('../controllers/message.controller');
const securityMiddleware = require('../middlewares/security.middleware');
const apiKeyAuth = require('../middlewares/api-key-auth');
const logger = require('../utils/logger');

// Request timeout middleware
const requestTimeout = (req, res, next) => {
  const timeoutMs = parseInt(process.env.REQUEST_TIMEOUT_MS || 30000);
  res.setTimeout(timeoutMs, () => {
    logger.warn(`Request timeout after ${timeoutMs}ms for ${req.originalUrl}`);
    res.status(408).json({
      success: false,
      message: 'Request timeout'
    });
  });
  next();
};

// Stricter rate limiting specific to the contact message endpoint
const messageLimiter = rateLimit({
  windowMs: parseInt(process.env.MESSAGE_RATE_WINDOW_MS) || 60 * 60 * 1000, // 1 hour window by default
  max: parseInt(process.env.MESSAGE_RATE_LIMIT) || 2, // limit each IP to 2 requests per windowMs (configurable)
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count successful requests
  message: {
    success: false,
    message: 'Thank you for your message! To protect our systems, we limit how many messages can be submitted. Please try again in an hour.'
  },
  handler: (req, res, _, options) => {
    logger.warn(`Rate limit exceeded for contact form: ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  }
});

/**
 * @route POST /api/contact/submit
 * @desc Submit contact message
 * @access Public (with API key)
 */
router.post('/submit', 
  requestTimeout,
  securityMiddleware, 
  messageLimiter,
  apiKeyAuth, 
  submitMessage
);

module.exports = router;