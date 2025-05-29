const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { sendNotification, sendDataOnlyNotification } = require('../controllers/notification.controller');
const securityMiddleware = require('../middlewares/security.middleware');
const firebaseAuthMiddleware = require('../middlewares/firebase-auth.middleware');
const apiKeyAuth = require('../middlewares/api-key-auth');
const logger = require('../utils/logger');
const { validateSchema, schemas } = require('../middlewares/validate-schema');
const { SECURITY_CONFIG, RATE_LIMITING } = require('../config/constants');

// Constants for rate limiting configurations
const DEFAULT_NOTIFICATION_RATE_LIMIT = 100;       // 100 notifications per hour
const NOTIFICATION_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const HIGH_PRIORITY_RATE_LIMIT = 50;               // 50 high-priority notifications per hour
const HIGH_PRIORITY_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Request timeout middleware - ensures requests don't hang indefinitely
 * Particularly important for Cloud Run which has request timeouts
 */
const requestTimeout = (req, res, next) => {
  const timeoutMs = SECURITY_CONFIG.REQUEST_TIMEOUT_MS;
  
  // Set up the timeout handler
  const timeoutId = setTimeout(() => {
    const path = req.originalUrl || req.url;
    logger.warn(`Request timeout after ${timeoutMs}ms for ${path}`, { 
      path,
      method: req.method,
      ip: req.ip
    });
    
    // Only send response if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        message: 'Request timeout'
      });
    }
  }, timeoutMs);
  
  // Clear the timeout when the response is sent
  res.on('finish', () => {
    clearTimeout(timeoutId);
  });
  
  // Clear the timeout if there's an error
  res.on('close', () => {
    clearTimeout(timeoutId);
  });
  
  next();
};

/**
 * Rate limiting for standard FCM notifications
 */
const notificationRateLimiter = rateLimit({
  windowMs: NOTIFICATION_RATE_LIMIT_WINDOW_MS,
  max: DEFAULT_NOTIFICATION_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,  
  message: {
    success: false,
    message: 'Too many notification requests from this IP, please try again later.'
  },
  handler: (req, res, _, options) => {
    logger.warn(`Rate limit exceeded for notifications: ${req.ip}`, {
      endpoint: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.status(options.statusCode).send(options.message);
  }
});

/**
 * Rate limiting for high-priority data-only notifications
 */
const highPriorityRateLimiter = rateLimit({
  windowMs: HIGH_PRIORITY_RATE_LIMIT_WINDOW_MS,
  max: HIGH_PRIORITY_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
  message: {
    success: false,
    message: 'Too many high-priority notification requests from this IP, please try again later.'
  },
  handler: (req, res, _, options) => {
    logger.warn(`Rate limit exceeded for high-priority notifications: ${req.ip}`, {
      endpoint: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.status(options.statusCode).send(options.message);
  }
});

/**
 * Request tracking middleware for monitoring and debugging
 */
const requestTrackingMiddleware = (req, res, next) => {
  // Add request tracking for monitoring response time
  req.startTime = Date.now();
  
  // Add request ID for tracing through logs
  req.requestId = req.headers['x-request-id'] || 
                 `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  logger.info(`Notification request started`, {
    requestId: req.requestId,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  next();
};

/**
 * Response time tracking middleware
 */
const responseTrackingMiddleware = (req, res, next) => {
  const responseTime = Date.now() - req.startTime;
  
  // Log response time for monitoring
  logger.info(`Notification request completed`, {
    requestId: req.requestId,
    path: req.originalUrl,
    method: req.method,
    responseTime,
    statusCode: res.statusCode
  });
  
  // Log slow requests for performance monitoring
  if (responseTime > 5000) { // Log requests taking more than 5 seconds
    logger.warn(`Slow notification request detected`, {
      requestId: req.requestId,
      path: req.originalUrl,
      method: req.method,
      responseTime
    });
  }
  
  next();
};

// Apply middlewares to all routes
router.use(securityMiddleware);
router.use(requestTimeout);

/**
 * Send a standard FCM notification with title and body
 * POST /api/notifications/send
 * Expects: { "uid" or "recipientUid": "firebase-uid", "title": "notification title", "body": "notification body", "data": { optional data object } }
 */
router.post(
  '/send',
  apiKeyAuth,  // Verify the API key
  firebaseAuthMiddleware,  // Verify Firebase authentication
  notificationRateLimiter,  // Apply rate limiting
  validateSchema(schemas.sendNotificationSchema),  // Validate request body
  requestTrackingMiddleware,  // Add request tracking
  sendNotification,  // Controller function
  responseTrackingMiddleware  // Response time tracking
);

/**
 * Send a data-only FCM notification with high priority
 * POST /api/notifications/send-data-only
 * Expects: { "uid" or "recipientUid": "firebase-uid", "data": { required data object } }
 */
router.post(
  '/send-data-only',
  apiKeyAuth,  // Verify the API key
  firebaseAuthMiddleware,  // Verify Firebase authentication
  highPriorityRateLimiter,  // Apply stricter rate limiting for high-priority notifications
  validateSchema(schemas.sendDataOnlyNotificationSchema),  // Validate request body
  requestTrackingMiddleware,  // Add request tracking
  sendDataOnlyNotification,  // Controller function
  responseTrackingMiddleware  // Response time tracking
);

module.exports = router;
