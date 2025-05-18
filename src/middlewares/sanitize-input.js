const logger = require('../utils/logger');

/**
 * Middleware to sanitize request inputs
 * This helps prevent XSS, injection attacks, and other input-based vulnerabilities
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const sanitizeInput = (req, res, next) => {
  try {
    // Sanitize request body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL params
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    logger.error('Error in sanitize-input middleware:', error);
    next(error);
  }
};

/**
 * Recursively sanitizes all string values in an object
 * @param {Object|Array|string|number|boolean} obj - The object to sanitize
 * @returns {Object|Array|string|number|boolean} - The sanitized object
 */
const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle different types
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize both keys and values
      result[sanitizeString(key)] = sanitizeObject(value);
    }
    return result;
  }

  // For numbers, booleans, etc. return as is
  return obj;
};

/**
 * Sanitizes a string to prevent XSS and other injection attacks
 * @param {string} str - The string to sanitize
 * @returns {string} - The sanitized string
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') {
    return str;
  }

  return str
    // Replace HTML special chars
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    // Remove potential script injections
    .replace(/javascript:/gi, 'blocked:')
    .replace(/on\w+=/gi, 'blocked=')
    // Remove excessive whitespace
    .replace(/\s{2,}/g, ' ')
    .trim();
};

module.exports = sanitizeInput;
