const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const apiKeyAuth = require('../middlewares/api-key-auth');
const healthService = require('../services/health.service');
const logger = require('../utils/logger');

/**
 * Rate limiter specifically for health endpoints to prevent abuse
 * Limits to 10 requests per 5 minutes per IP
 */
const healthCheckLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minute window
  max: 5, // limit each IP to 5 health check requests per 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many health check requests, please try again later.'
  }
});

/**
 * @route   GET /api/health
 * @desc    Get comprehensive system health information
 * @access  Private (requires API key)
 * @returns {Object} Detailed system health information
 */
router.get('/', healthCheckLimiter, apiKeyAuth, async (req, res) => {
  try {
    // Get full system health information
    const healthInfo = await healthService.getSystemHealth();

    // Determine HTTP status code based on health status
    const statusCode = healthInfo.status === 'healthy' ? 200 : 
                       healthInfo.status === 'unhealthy' ? 503 : 500;
    
    // Always return full detailed health information
    res.status(statusCode).json(healthInfo);
  } catch (error) {
    logger.error('Health check endpoint error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to retrieve system health information',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
