/**
 * Application Configuration Constants
 * This file contains hardcoded configuration values that don't need to change between environments
 */

// Database Configuration
const DATABASE_CONFIG = {
  DB_NAME: 'DuckBuck',
  CONNECTION_POOL_SIZE: 20,
  RETRY_WRITES: true,
  COLLECTIONS: {
    WAITLIST: 'waitlist',
    MESSAGES: 'messages'
  }
};

// Rate Limiting Configuration
const RATE_LIMITING = {
  API: {
    LIMIT: 50,
    WINDOW_MS: 900000 // 15 minutes
  },
  WAITLIST: {
    LIMIT: 3,
    WINDOW_MS: 3600000 // 1 hour
  },
  MESSAGE: {
    LIMIT: 2,
    WINDOW_MS: 3600000 // 1 hour
  },
  EMAIL: {
    LIMIT: 10,
    WINDOW_MS: 3600000 // 1 hour
  }
};

// Security Configuration
const SECURITY_CONFIG = {
  REQUEST_TIMEOUT_MS: 30000,
  ENABLE_HTTPS_REDIRECT: true,
  TRUST_PROXY: true,
  PROXY_COUNT: 1,
  CSP_DIRECTIVES: "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
  IP_BLACKLIST: {
    THRESHOLD: 50,
    WINDOW_MS: 3600000 // 1 hour
  }
};

// Email Configuration
const EMAIL_CONFIG = {
  HOST: 'smtp.gmail.com',
  PORT: 465,
  SECURE: true
};

// Logging Configuration
const LOGGING_CONFIG = {
  LEVEL: 'info',
  SANITIZE_LOGS: true,
  DEBUG_IP: true
};

// Development Configuration
const DEVELOPMENT_CONFIG = {
  ENABLE_RATE_LIMIT_IN_DEV: false  // Set to true to enable rate limiting in development
};

module.exports = {
  DATABASE_CONFIG,
  RATE_LIMITING,
  SECURITY_CONFIG,
  EMAIL_CONFIG,
  LOGGING_CONFIG,
  DEVELOPMENT_CONFIG
};
