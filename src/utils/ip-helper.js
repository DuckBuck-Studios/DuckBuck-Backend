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
    
    // PRIORITY 1: Check for Cloudflare's specific header - most reliable for Cloudflare-proxied sites
    const cfConnectingIp = req.headers['cf-connecting-ip'];
    if (cfConnectingIp) {
      return cfConnectingIp;
    }
    
    // PRIORITY 2: Check for standard real-IP header (common in Nginx)
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return realIp;
    }
    
    // PRIORITY 3: Process X-Forwarded-For header
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = forwardedFor.split(',').map(ip => ip.trim());
      
      // Filter out private IPs (sometimes added by internal proxies)
      const publicIps = ips.filter(ip => !isPrivateIp(ip));
      
      if (publicIps.length > 0) {
        // For most proxies, the client IP is the first entry in x-forwarded-for
        // But for Google Cloud Run, it might be the last public IP
        const isGoogleEnv = req.headers['x-cloud-trace-context'] || 
                            req.headers['x-google-cloud-trace'] ||
                            process.env.GOOGLE_CLOUD_PROJECT;
        
        return isGoogleEnv ? publicIps[publicIps.length - 1] : publicIps[0];
      }
      
      // If no public IPs found, use first or last based on environment
      const isGoogleEnv = req.headers['x-cloud-trace-context'] || 
                          req.headers['x-google-cloud-trace'] ||
                          process.env.GOOGLE_CLOUD_PROJECT;
      
      return isGoogleEnv ? ips[ips.length - 1] : ips[0];
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
