const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { generateAgoraToken } = require('../controllers/agora.controller');
const securityMiddleware = require('../middlewares/security.middleware');
const firebaseAuthMiddleware = require('../middlewares/firebase-auth.middleware');
const apiKeyAuth = require('../middlewares/api-key-auth');
const logger = require('../utils/logger');
const { validateSchema, schemas } = require('../middlewares/validate-schema');
const { SECURITY_CONFIG } = require('../config/constants');

// Constants for rate limiting configurations
const AGORA_TOKEN_RATE_LIMIT = 50;              // 50 token generations per hour
const AGORA_TOKEN_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Request timeout middleware
 */
const requestTimeout = (req, res, next) => {
  const timeoutMs = SECURITY_CONFIG.REQUEST_TIMEOUT_MS;
  
  const timeoutId = setTimeout(() => {
    const path = req.originalUrl || req.url;
    logger.warn(`Request timeout after ${timeoutMs}ms for ${path}`, { 
      path,
      method: req.method,
      ip: req.ip
    });
    
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        message: 'Request timeout'
      });
    }
  }, timeoutMs);
  
  res.on('finish', () => {
    clearTimeout(timeoutId);
  });
  
  res.on('close', () => {
    clearTimeout(timeoutId);
  });
  
  next();
};

/**
 * Rate limiting for Agora token generation
 */
const agoraTokenRateLimiter = rateLimit({
  windowMs: AGORA_TOKEN_RATE_LIMIT_WINDOW_MS,
  max: AGORA_TOKEN_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message: 'Too many token generation requests from this IP, please try again later.'
  },
  handler: (req, res, _, options) => {
    logger.warn(`Rate limit exceeded for Agora tokens: ${req.ip}`, {
      endpoint: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.status(options.statusCode).send(options.message);
  }
});

/**
 * Request tracking middleware
 */
const requestTrackingMiddleware = (req, res, next) => {
  req.startTime = Date.now();
  req.requestId = req.headers['x-request-id'] || 
                 `agora-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  logger.info(`Agora token request started`, {
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
  
  logger.info(`Agora token request completed`, {
    requestId: req.requestId,
    path: req.originalUrl,
    method: req.method,
    responseTime,
    statusCode: res.statusCode
  });
  
  if (responseTime > 3000) {
    logger.warn(`Slow Agora token request detected`, {
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
 * Generate Agora RTC token for video calling
 * POST /api/agora/generate-token
 * Expects: { "channelId": "channel-name" }
 */
router.post(
  '/generate-token',
  apiKeyAuth,  // Verify the API key
  firebaseAuthMiddleware,  // Verify Firebase authentication
  agoraTokenRateLimiter,  // Apply rate limiting
  validateSchema(schemas.generateAgoraTokenSchema),  // Validate request body
  requestTrackingMiddleware,  // Add request tracking
  generateAgoraToken,  // Controller function
  responseTrackingMiddleware  // Response time tracking
);

module.exports = router;
