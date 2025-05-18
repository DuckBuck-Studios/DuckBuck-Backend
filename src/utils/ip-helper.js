/**
 * IP Helper utility for correctly identifying client IP addresses
 * - Handles various proxy scenarios and headers
 * - Works with both IPv4 and IPv6 addresses
 */
const logger = require('./logger');

/**
 * Extract the real client IP from request
 * Properly handles various proxy scenarios and headers
 * @param {Object} req - Express request object
 * @returns {string} - The client's real IP address
 */
const getClientIp = (req) => {
  try {
    // Log relevant headers for debugging in Google Cloud Run
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_IP === 'true') {
      logger.debug(`IP Helper - Headers: x-forwarded-for: ${req.headers['x-forwarded-for'] || 'none'}, ` +
                 `x-real-ip: ${req.headers['x-real-ip'] || 'none'}, ` + 
                 `cf-connecting-ip: ${req.headers['cf-connecting-ip'] || 'none'}, ` +
                 `req.ip: ${req.ip || 'none'}, ` +
                 `In Google environment: ${Boolean(req.headers['x-cloud-trace-context'] || 
                                        req.headers['x-google-cloud-trace'] ||
                                        process.env.GOOGLE_CLOUD_PROJECT)}`);
    }
    
    // Check for Google Cloud Run specific headers
    // Google Cloud Run puts the original client IP in the last entry of X-Forwarded-For
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    
    // If x-forwarded-for exists, it contains a comma-separated list of IPs
    if (forwardedFor) {
      // For Google Cloud Run, the client IP is typically the last entry
      // But we'll check both first and last for better compatibility
      const ips = forwardedFor.split(',').map(ip => ip.trim());
      
      // Filter out private IPs (sometimes added by internal proxies)
      const publicIps = ips.filter(ip => !isPrivateIp(ip));
      
      if (publicIps.length > 0) {
        // In Google Cloud Run, the last entry is usually the original client IP
        // But in other environments it's often the first entry
        // So we check if we're in a Google-hosted environment
        if (req.headers['x-cloud-trace-context'] || 
            req.headers['x-google-cloud-trace'] ||
            process.env.GOOGLE_CLOUD_PROJECT) {
          return publicIps[publicIps.length - 1]; // Last entry for Google environments
        } else {
          return publicIps[0]; // First entry for standard proxy setups
        }
      }
      
      // If no public IPs, use the appropriate entry based on environment
      if (req.headers['x-cloud-trace-context'] || 
          req.headers['x-google-cloud-trace'] ||
          process.env.GOOGLE_CLOUD_PROJECT) {
        return ips[ips.length - 1]; // Last entry for Google environments
      } else {
        return ips[0]; // First entry for standard proxy setups
      }
    }
    
    // Check x-real-ip header (common in Nginx)
    if (realIp) {
      return realIp;
    }
    
    // If behind a CF proxy, check Cloudflare specific header
    const cfConnectingIp = req.headers['cf-connecting-ip'];
    if (cfConnectingIp) {
      return cfConnectingIp;
    }
    
    // Fallback to standard request properties
    // Note: If app.set('trust proxy') is configured, req.ip should already be correct
    return req.ip || req.connection.remoteAddress || 'Unknown IP';
  } catch (error) {
    logger.error('Error extracting client IP:', error);
    return 'Unknown IP';
  }
};

/**
 * Check if an IP address is a private/internal IP
 * @param {string} ip - The IP address to check
 * @returns {boolean} - Whether the IP is private/internal
 */
const isPrivateIp = (ip) => {
  // Convert to lowercase and trim
  ip = (ip || '').toLowerCase().trim();
  
  // Check for localhost or private IPv4 patterns
  return ip.startsWith('10.') || 
         ip.startsWith('172.16.') || 
         ip.startsWith('172.17.') || 
         ip.startsWith('172.18.') || 
         ip.startsWith('172.19.') || 
         ip.startsWith('172.2') || 
         ip.startsWith('172.30.') || 
         ip.startsWith('172.31.') || 
         ip.startsWith('192.168.') ||
         ip === '127.0.0.1' || 
         ip === '::1' ||
         ip === 'localhost' ||
         ip.includes('::ffff:'); // IPv4 mapped to IPv6
};

module.exports = {
  getClientIp
};
