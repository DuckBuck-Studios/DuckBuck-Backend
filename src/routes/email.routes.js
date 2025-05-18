const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const emailController = require('../controllers/email.controller');
const securityMiddleware = require('../middlewares/security.middleware');
const apiKeyAuth = require('../middlewares/api-key-auth');
const firebaseAuthMiddleware = require('../middlewares/firebase-auth.middleware');
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
  validateSchema(schemas.welcomeEmail), // Added schema validation
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
  validateSchema(schemas.loginNotificationEmail), // Added schema validation
  emailController.sendLoginNotificationHandler
);

/**
 * @route GET /api/email/ip-debug
 * @desc Get diagnostic information about IP detection (only available in development or with DEBUG_IP flag)
 * @access Private (requires API key)
 */
router.get('/ip-debug', 
  apiKeyAuth,
  (req, res) => {
    // Only available in development or if DEBUG_IP is enabled
    if (process.env.NODE_ENV !== 'development' && process.env.DEBUG_IP !== 'true') {
      return res.status(404).json({
        success: false,
        message: 'Not found'
      });
    }
    
    const { getClientIp } = require('../utils/ip-helper');
    const geoip = require('geoip-lite');
    
    const clientIp = getClientIp(req);
    const detectedIp = clientIp === '::1' || clientIp === '127.0.0.1' ? '8.8.8.8' : clientIp;
    const geo = geoip.lookup(detectedIp);
    
    res.json({
      success: true,
      data: {
        headers: {
          'x-forwarded-for': req.headers['x-forwarded-for'] || null,
          'x-real-ip': req.headers['x-real-ip'] || null,
          'cf-connecting-ip': req.headers['cf-connecting-ip'] || null,
          'x-cloud-trace-context': req.headers['x-cloud-trace-context'] || null,
          'x-google-cloud-trace': req.headers['x-google-cloud-trace'] || null
        },
        requestIp: req.ip,
        detectedClientIp: clientIp,
        inGoogleEnvironment: Boolean(req.headers['x-cloud-trace-context'] || 
                                    req.headers['x-google-cloud-trace'] || 
                                    process.env.GOOGLE_CLOUD_PROJECT),
        geoLocation: geo ? {
          country: geo.country,
          region: geo.region,
          city: geo.city,
          timezone: geo.timezone,
          ll: geo.ll
        } : 'Unknown'
      }
    });
  }
);

module.exports = router;