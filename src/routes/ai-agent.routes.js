const express = require('express');
const rateLimit = require('express-rate-limit');
const { joinAgent, stopAgent } = require('../controllers/ai-agent.controller');
const securityMiddleware = require('../middlewares/security.middleware');
const apiKeyAuth = require('../middlewares/api-key-auth');
const { validateSchema, schemas } = require('../middlewares/validate-schema');
const sanitizeInput = require('../middlewares/sanitize-input');
const logger = require('../utils/logger');
const { SECURITY_CONFIG } = require('../config/constants');

const router = express.Router();

// Constants for rate limiting configurations
const AI_AGENT_RATE_LIMIT = 20;                // 20 AI agent operations per hour
const AI_AGENT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Request timeout middleware
 */
const requestTimeout = (req, res, next) => {
  const timeoutMs = SECURITY_CONFIG.REQUEST_TIMEOUT_MS;
  
  const timeoutId = setTimeout(() => {
    const path = req.originalUrl || req.url;
    logger.warn(`AI Agent request timeout after ${timeoutMs}ms for ${path}`, { 
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
 * Rate limiting for AI agent operations
 */
const aiAgentRateLimit = rateLimit({
  windowMs: AI_AGENT_RATE_LIMIT_WINDOW_MS,
  max: AI_AGENT_RATE_LIMIT,
  message: {
    success: false,
    message: `Too many AI agent requests. Maximum ${AI_AGENT_RATE_LIMIT} requests per hour allowed.`
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`AI Agent rate limit exceeded for IP: ${req.ip}`, {
      ip: req.ip,
      path: req.originalUrl,
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      success: false,
      message: `Too many AI agent requests. Maximum ${AI_AGENT_RATE_LIMIT} requests per hour allowed.`
    });
  }
});

/**
 * @route   POST /api/ai-agent/join
 * @desc    Start a conversational AI agent using Agora API with Microsoft TTS and Gemini LLM
 * @access  Protected (API Key required)
 * @body    {uid: string, channelName: string}
 */
router.post('/join', 
  requestTimeout,
  securityMiddleware,
  apiKeyAuth,
  aiAgentRateLimit,
  sanitizeInput,
  validateSchema(schemas.joinAiAgentSchema),
  joinAgent
);

/**
 * @route   POST /api/ai-agent/stop
 * @desc    Stop a conversational AI agent using Agora API
 * @access  Protected (API Key required)
 * @body    {agentId: string}
 */
router.post('/stop',
  requestTimeout,
  securityMiddleware,
  apiKeyAuth,
  aiAgentRateLimit,
  sanitizeInput,
  validateSchema(schemas.stopAiAgentSchema),
  stopAgent
);

module.exports = router;