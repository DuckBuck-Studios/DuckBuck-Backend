const logger = require('../utils/logger');

// Track failed requests by IP to detect potential attacks
const failedRequestTracker = {
  ipLog: new Map(),
  blacklist: new Set(),
  
  // Record failed attempt for an IP
  recordFailure(ip) {
    const now = Date.now();
    const threshold = parseInt(process.env.IP_BLACKLIST_THRESHOLD || 100);
    const window = parseInt(process.env.IP_BLACKLIST_WINDOW_MS || 3600000); // 1 hour default
    
    if (!this.ipLog.has(ip)) {
      this.ipLog.set(ip, []);
    }
    
    // Add current timestamp
    const attempts = this.ipLog.get(ip);
    attempts.push(now);
    
    // Filter to keep only attempts within the time window
    const recentAttempts = attempts.filter(time => (now - time) < window);
    this.ipLog.set(ip, recentAttempts);
    
    // Blacklist IP if too many failed attempts
    if (recentAttempts.length > threshold) {
      this.blacklist.add(ip);
      logger.warn(`IP Address ${ip} blacklisted due to excessive failures`);
    }
  },
  
  // Check if an IP is blacklisted
  isBlacklisted(ip) {
    return this.blacklist.has(ip);
  },
  
  // Clean up stale entries periodically
  cleanup() {
    const now = Date.now();
    const window = parseInt(process.env.IP_BLACKLIST_WINDOW_MS || 3600000);
    
    for (const [ip, attempts] of this.ipLog.entries()) {
      // Remove attempts older than the window
      const recentAttempts = attempts.filter(time => (now - time) < window);
      
      if (recentAttempts.length === 0) {
        this.ipLog.delete(ip);
      } else {
        this.ipLog.set(ip, recentAttempts);
      }
    }
  }
};

// Set up periodic cleanup every hour
setInterval(() => failedRequestTracker.cleanup(), 3600000);

/**
 * Enhanced security middleware with advanced protection features
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const securityMiddleware = (req, res, next) => {
  try {
    // Check for blacklisted IPs
    const clientIP = req.ip || req.connection.remoteAddress;
    if (failedRequestTracker.isBlacklisted(clientIP)) {
      logger.warn(`Blocked request from blacklisted IP: ${clientIP}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Add security headers with CSP from environment if available
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    
    // Set Content-Security-Policy from environment if available
    const cspDirectives = process.env.CSP_DIRECTIVES || "default-src 'self'";
    res.setHeader('Content-Security-Policy', cspDirectives);
    
    // Add Permissions-Policy header to limit features
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Add Referrer-Policy to control referrer information
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Check for suspicious requests
    const userAgent = req.headers['user-agent'] || '';
    const contentType = req.headers['content-type'] || '';
    
    // Enhanced suspicious agent detection
    const suspiciousAgents = [
      'sqlmap', 'nikto', 'nessus', 'dirbuster', 'nmap', 'burpsuite', 'hydra',
      'harvester', 'masscan', 'zmap', 'w3af', 'metasploit'
    ];
    
    if (suspiciousAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
      failedRequestTracker.recordFailure(clientIP);
      logger.warn(`Blocked suspicious user agent: ${userAgent} from IP: ${clientIP}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Detect potential SQL injection or XSS patterns in request parameters
    const requestBody = JSON.stringify(req.body).toLowerCase();
    const requestQuery = JSON.stringify(req.query).toLowerCase();
    const maliciousPatterns = [
      'union select', 'exec(', 'eval(', '<script>', 'javascript:', 'onload=',
      'onerror=', '1=1;', 'drop table', 'alert(', 'document.cookie', '-->'
    ];
    
    if (maliciousPatterns.some(pattern => 
      requestBody.includes(pattern) || requestQuery.includes(pattern))) {
      failedRequestTracker.recordFailure(clientIP);
      logger.warn(`Potential attack pattern detected from IP: ${clientIP}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid request'
      });
    }
    
    // For JSON endpoints, ensure content type is application/json
    if (req.method === 'POST' && 
        contentType !== 'application/json' && 
        !contentType.includes('application/x-www-form-urlencoded') &&
        !contentType.includes('multipart/form-data')) {
      failedRequestTracker.recordFailure(clientIP);
      logger.warn(`Invalid content type for POST request: ${contentType} from IP: ${clientIP}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid content type'
      });
    }

    next();
  } catch (error) {
    logger.error('Error in security middleware:', error);
    next(error);
  }
};

module.exports = securityMiddleware;