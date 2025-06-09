const express = require('express');
const router = express.Router();
const { createWebCall } = require('../controllers/ai-agent.controller');
const apiKeyAuth = require('../middlewares/api-key-auth');
const firebaseAuthMiddleware = require('../middlewares/firebase-auth.middleware');

/**
 * @route   POST /api/ai-agent/call
 * @desc    Create WebSocket URL for VAPI AI agent call
 * @access  Private (API Key + Firebase Token required)
 * @middleware
 *   - apiKeyAuth: Validates API key in headers
 *   - firebaseAuthMiddleware: Validates Firebase authentication token
 * @body    {Object} { uid: string } - User ID to check agent time
 * @returns {Object} WebSocket URL and call metadata
 */
router.post('/call',  apiKeyAuth,firebaseAuthMiddleware, createWebCall);

module.exports = router;
