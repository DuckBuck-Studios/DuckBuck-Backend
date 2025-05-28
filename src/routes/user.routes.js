const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { deleteUser, sendWelcomeEmailHandler, sendLoginNotificationHandler, ipDebug } = require('../controllers/user.controller');
const securityMiddleware = require('../middlewares/security.middleware');
const firebaseAuthMiddleware = require('../middlewares/firebase-auth.middleware');
const apiKeyAuth = require('../middlewares/api-key-auth');
const logger = require('../utils/logger');
const { validateSchema, schemas } = require('../middlewares/validate-schema');
const { SECURITY_CONFIG, RATE_LIMITING, DEVELOPMENT_CONFIG } = require('../config/constants');

// Constants for configurations
const DEFAULT_USER_RATE_LIMIT = 10;             // 10 requests per hour
const USER_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_EMAIL_RATE_LIMIT = 5;
const EMAIL_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_IP_DEBUG_RATE_LIMIT = 5;
const IP_DEBUG_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

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
 * Rate limiting specifically for high-value user operations
 * Uses in-memory store by default, but can be configured to use Redis in production
 */
const userRateLimiter = rateLimit({
  windowMs: USER_RATE_LIMIT_WINDOW_MS, // Directly use constant
  max: DEFAULT_USER_RATE_LIMIT, // Directly use constant
  standardHeaders: true, 
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  },
  handler: (req, res, _, options) => {
    logger.warn(`Rate limit exceeded for user operations`, {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
      userAgent: req.get('User-Agent')
    });
    
    if (!res.headersSent) {
      res.status(options.statusCode).json(options.message);
    }
  },
  // Skip in development unless explicitly enabled
  skip: (req) => process.env.NODE_ENV !== 'production' && !DEVELOPMENT_CONFIG.ENABLE_RATE_LIMIT_IN_DEV
});

/**
 * Rate limiting for email endpoints
 */
const emailLimiter = rateLimit({
  windowMs: EMAIL_RATE_LIMIT_WINDOW_MS, // Directly use constant
  max: DEFAULT_EMAIL_RATE_LIMIT, // Directly use constant
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
 * Rate limiting for IP Debug endpoint
 */
const ipDebugRateLimiter = rateLimit({
  windowMs: IP_DEBUG_RATE_LIMIT_WINDOW_MS, // Directly use constant
  max: DEFAULT_IP_DEBUG_RATE_LIMIT, // Directly use constant
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
  message: {
    success: false,
    message: 'Too many requests to IP debug endpoint from this IP, please try again later.'
  },
  handler: (req, res, _, options) => {
    logger.warn(`Rate limit exceeded for IP debug endpoint: ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  }
});

/**
 * Validate request body contains required parameters
 */
const validateDeleteUserRequest = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Invalid request body'
    });
  }
  
  if (!req.body.uid || typeof req.body.uid !== 'string' || req.body.uid.trim() === '') {
    return res.status(400).json({
      success: false, 
      message: 'Request body must contain a valid uid parameter'
    });
  }
  
  // Trim whitespace and normalize the UID
  req.body.uid = req.body.uid.trim();
  
  next();
};

// Apply middlewares to all routes
router.use(securityMiddleware);
router.use(requestTimeout);

// Delete user endpoint - accepts Firebase UID in request body as "uid"
router.delete(
  '/delete',
  userRateLimiter,
  apiKeyAuth,  // First verify the API key
  firebaseAuthMiddleware,  // Then verify Firebase authentication
  validateDeleteUserRequest, // Validate request body
  (req, res, next) => {
    // Add request tracking for monitoring response time
    req.startTime = Date.now();
    
    // Add request ID for tracing through logs
    req.requestId = req.headers['x-request-id'] || 
                   `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    next();
  },
  deleteUser,
  // Response time tracking middleware
  (req, res, next) => {
    const responseTime = Date.now() - req.startTime;
    
    // Log response time for monitoring
    if (responseTime > 1000) { // Only log slow requests
      logger.debug(`Request completed in ${responseTime}ms`, {
        requestId: req.requestId,
        path: req.originalUrl,
        method: req.method,
        responseTime
      });
    }
    
    next();
  }
);

// Email notification endpoints

/**
 * Send a welcome email to the user
 * Expects { "uid": "user-firebase-uid" } in the request body
 */
router.post(
  '/send-welcome-email',
  apiKeyAuth,  // Verify the API key
  firebaseAuthMiddleware,  // Verify Firebase authentication
  validateSchema(schemas.sendWelcomeEmailSchema),  // Validate request body
  (req, res, next) => {
    // Add request tracking for monitoring response time
    req.startTime = Date.now();
    
    // Add request ID for tracing through logs
    req.requestId = req.headers['x-request-id'] || 
                   `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    next();
  },
  sendWelcomeEmailHandler,
  // Response time tracking middleware
  (req, res, next) => {
    const responseTime = Date.now() - req.startTime;
    
    // Log response time for monitoring
    if (responseTime > 1000) { // Only log slow requests
      logger.debug(`Request completed in ${responseTime}ms`, {
        requestId: req.requestId,
        path: req.originalUrl,
        method: req.method,
        responseTime
      });
    }
    
    next();
  }
);

/**
 * Send a login notification email to the user
 * Expects { "uid": "user-firebase-uid" } in the request body
 */
router.post(
  '/send-login-notification',
  apiKeyAuth,  // Verify the API key
  firebaseAuthMiddleware,  // Verify Firebase authentication
  validateSchema(schemas.sendLoginNotificationSchema),  // Validate request body
  (req, res, next) => {
    // Add request tracking for monitoring response time
    req.startTime = Date.now();
    
    // Add request ID for tracing through logs
    req.requestId = req.headers['x-request-id'] || 
                   `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    next();
  },
  sendLoginNotificationHandler,
  // Response time tracking middleware
  (req, res, next) => {
    const responseTime = Date.now() - req.startTime;
    
    // Log response time for monitoring
    if (responseTime > 1000) { // Only log slow requests
      logger.debug(`Request completed in ${responseTime}ms`, {
        requestId: req.requestId,
        path: req.originalUrl,
        method: req.method,
        responseTime
      });
    }
    
    next();
  }
);

// New IP Debug Route
router.get(
  '/ip-debug',
  apiKeyAuth,  // Existing: API key check first
  ipDebugRateLimiter, // Added: Rate limit this specific endpoint
  ipDebug
);

module.exports = router;
