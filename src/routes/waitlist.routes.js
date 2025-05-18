const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { addToWaitlist } = require('../controllers/waitlist.controller');
const validateEmail = require('../middlewares/validate-email');
const securityMiddleware = require('../middlewares/security.middleware');
const apiKeyAuth = require('../middlewares/api-key-auth');
const { validateSchema, schemas } = require('../middlewares/validate-schema');
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

// Stricter rate limiting specific to the waitlist endpoint
const waitlistRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: process.env.WAITLIST_RATE_LIMIT || 5, // limit each IP to 5 requests per windowMs (configurable)
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count successful requests
  message: {
    success: false,
    message: 'Thank you for your interest! To protect our systems, we limit how many emails can be submitted. Please try again in an hour.'
  },
  handler: (req, res, _, options) => {
    logger.warn(`Rate limit exceeded for waitlist: ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  }
});

/**
 * @route POST /api/waitlist
 * @desc Add email to waitlist
 * @access Public (with API key)
 */
router.post('/', 
  requestTimeout,
  securityMiddleware, 
  waitlistRateLimiter,
  apiKeyAuth, 
  validateEmail, 
  validateSchema(schemas.email), // Added schema validation
  addToWaitlist
);

module.exports = router;