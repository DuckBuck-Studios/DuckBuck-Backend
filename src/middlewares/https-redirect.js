const logger = require('../utils/logger');

/**
 * Middleware to redirect HTTP requests to HTTPS
 * Only enforced in production when ENABLE_HTTPS_REDIRECT is true
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const httpsRedirect = (req, res, next) => {
  // Skip redirect for non-production environments unless explicitly enabled
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_HTTPS_REDIRECT !== 'true') {
    return next();
  }
  
  // Check if request is already secure or is using a proxy header indicating HTTPS
  if (req.secure || (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] === 'https')) {
    return next();
  }
  
  // Redirect to HTTPS
  const httpsUrl = `https://${req.hostname}${req.originalUrl}`;
  logger.info(`Redirecting to HTTPS: ${httpsUrl}`);
  return res.redirect(301, httpsUrl);
};

module.exports = httpsRedirect;