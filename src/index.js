const path = require('path'); 
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const compression = require('compression');
const connectDB = require('./config/database');
const logger = require('./utils/logger');
const httpsRedirect = require('./middlewares/https-redirect');
const { SECURITY_CONFIG, RATE_LIMITING } = require('./config/constants');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Connect to MongoDB
connectDB();

// Trust proxies if behind a load balancer or on Google Cloud Run
if (SECURITY_CONFIG.TRUST_PROXY || 
    process.env.K_SERVICE || // Google Cloud Run environment variable
    process.env.GOOGLE_CLOUD_PROJECT) {
  // Trust first proxy, or multiple proxies if specified
  const proxyCount = SECURITY_CONFIG.PROXY_COUNT;
  
  // Cloud Run requires trusting at least one proxy
  logger.info(`Setting trust proxy to: ${proxyCount}`);
  app.set('trust proxy', proxyCount);
}

// Apply HTTPS redirect in production
app.use(httpsRedirect);

// Request timeout for all requests
app.use((req, res, next) => {
  const timeoutMs = SECURITY_CONFIG.REQUEST_TIMEOUT_MS;
  res.setTimeout(timeoutMs, () => {
    logger.warn(`Global request timeout after ${timeoutMs}ms for ${req.originalUrl}`);
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        message: 'Request timeout'
      });
    }
  });
  next();
});

// Security middleware - order matters
// Enhanced Helmet configuration with comprehensive security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", "*"],
      imgSrc: ["'self'", "data:", "*"],
      styleSrc: ["'self'", "'unsafe-inline'", "*"],
      scriptSrc: ["'self'", "*"],
      connectSrc: ["'self'", "*"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "*"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "*"],
      frameSrc: ["*"],
      formAction: ["'self'", "*"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: { policy: "require-corp" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  expectCt: { 
    enforce: true,
    maxAge: 30 * 24 * 60 * 60 // 30 days in seconds
  },
  frameguard: { action: "deny" },
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true
  },
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true
})); // Set security headers
app.use(xss()); // Prevent XSS attacks
app.use(mongoSanitize()); // Prevent MongoDB injection
app.use(hpp()); // Prevent HTTP Parameter Pollution

// Standard middleware
app.use(express.json({ limit: '10kb' })); // Body parser with payload size limit
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(compression()); // Compress responses

// Apply input sanitization to all requests
const sanitizeInput = require('./middlewares/sanitize-input');
app.use(sanitizeInput);

// Setup CORS for Flutter applications
app.use(cors({
  origin: '*', // Allow all origins for Flutter app requests
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  preflightContinue: false,
  optionsSuccessStatus: 204,
  credentials: true,
  maxAge: 86400 // Cache preflight requests for 24 hours
}));

// Logging middleware (development vs production)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: { write: message => logger.http(message.trim()) } }));
}

// Global rate limiting
const limiter = rateLimit({
  windowMs: RATE_LIMITING.API.WINDOW_MS,
  max: RATE_LIMITING.API.LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  },
  skip: (req) => process.env.NODE_ENV !== 'production'
});

// Apply rate limiting to all requests
app.use(limiter);

// Very strict rate limiter for root route
const rootRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minute window
  max: 3, // limit each IP to 3 requests per 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count successful requests against the rate limit
  message: {
    error: 'Access blocked',
    message: 'Too many attempts detected'
  }
});

// Root route with Google-style HTML response
const htmlRenderer = require('./utils/html-renderer');
app.get('/', rootRateLimiter, (req, res) => {
  const clientIP = req.ip || 'Unknown';
  const environment = process.env.NODE_ENV || 'development';
  logger.info(`Root endpoint accessed from IP: ${clientIP} in ${environment} environment`);
  
  // Explicitly set headers for proper HTML rendering
  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  // Generate HTML with environment variable
  const html = htmlRenderer.renderLandingPage({
    environment: environment
  });
  
  res.status(200).send(html);
});

// Routes
app.use('/api/waitlist', require('./routes/waitlist.routes'));
app.use('/api/contact', require('./routes/message.routes'));
app.use('/api/health', require('./routes/health.routes'));
app.use('/api/users', require('./routes/user.routes'));

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`${err.name}: ${err.message}`, { stack: err.stack });
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: process.env.NODE_ENV === 'production' ? 'Invalid input' : err.errors
    });
  }
  
  // Handle MongoDB errors
  if (err.code === 11000) { // Duplicate key error
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Resource already exists' : `${field} already exists`
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Resource not found'
  });
});

// Start server with error handling
const server = app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Set server timeouts
server.headersTimeout = 60000; // 60 seconds
server.keepAliveTimeout = 30000; // 30 seconds

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
  
  // Force close server after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  // Give the server a chance to finish current requests before shutting down
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  server.close(() => process.exit(1));
});

module.exports = app;