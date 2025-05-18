const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const emailController = require('../controllers/email.controller');
const securityMiddleware = require('../middlewares/security.middleware');
const apiKeyAuth = require('../middlewares/api-key-auth');
const firebaseAuthMiddleware = require('../middlewares/firebase-auth.middleware');
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

// Rate limiting for email endpoints
const emailLimiter = rateLimit({
  windowMs: parseInt(process.env.EMAIL_RATE_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes window by default
  max: parseInt(process.env.EMAIL_RATE_LIMIT) || 5, // limit each IP to 5 requests per windowMs (configurable)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests for email services from this IP, please try again after 15 minutes.'
  },
  handler: (req, res, _, options) => {
    logger.warn(`Rate limit exceeded for email service: ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  }
});

/**
 * @route POST /api/email/send-welcome
 * @desc Send a welcome email
 * @access Private (requires API key and Firebase Auth)
 */
router.post('/send-welcome', 
  requestTimeout,
  securityMiddleware, 
  emailLimiter,
  apiKeyAuth,
  firebaseAuthMiddleware,
  emailController.sendWelcomeEmailHandler
);

/**
 * @route POST /api/email/send-login-notification
 * @desc Send a login notification email
 * @access Private (requires API key and Firebase Auth)
 */
router.post('/send-login-notification', 
  requestTimeout,
  securityMiddleware, 
  emailLimiter,
  apiKeyAuth,
  firebaseAuthMiddleware,
  emailController.sendLoginNotificationHandler
);

module.exports = router;