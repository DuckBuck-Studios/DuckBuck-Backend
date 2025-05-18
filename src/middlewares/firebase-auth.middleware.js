const admin = require('firebase-admin');
const path = require('path');
const logger = require('../utils/logger');

// In production, prefer environment variables over files for Firebase config
// This allows for better security and easier deployment across environments
let firebaseInitialized = false;

try {
  // Check if Firebase Admin SDK is already initialized
  if (!admin.apps.length) {
    // Initialize using environment variable only
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      // Use service account from environment variable
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id // Extract project ID directly from service account JSON
      });
    } else {
      // No Firebase configuration available
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON environment variable is required');
    }
    
    firebaseInitialized = true;
    logger.info(`Firebase Admin SDK initialized successfully in ${process.env.NODE_ENV} environment.`);
  } else {
    // Firebase already initialized
    firebaseInitialized = true;
    logger.info('Firebase Admin SDK was already initialized.');
  }
} catch (error) {
  logger.error('Failed to initialize Firebase Admin SDK:', error);
  
  // In production, we should prevent the app from starting if Firebase auth fails
  if (process.env.NODE_ENV === 'production') {
    logger.error('Firebase initialization failed in production environment. Exiting process.');
    process.exit(1);
  } else {
    logger.warn('Firebase initialization failed in development. Authentication will fail.');
  }
}

/**
 * Middleware to authenticate requests using Firebase ID token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
// Create a token blacklist for revoked tokens (in a production app, this would use Redis)
const revokedTokens = new Set();
// Cache of validated tokens with expiration to improve performance
const validatedTokens = new Map();

/**
 * Check if a token has been manually revoked (e.g. during logout)
 * @param {string} token - The Firebase ID token
 * @returns {boolean} - Whether the token has been revoked
 */
const isTokenRevoked = (token) => {
  return revokedTokens.has(token);
};

/**
 * Add a token to the revoked list (used during logout)
 * @param {string} token - The Firebase ID token to revoke
 */
const revokeToken = (token) => {
  revokedTokens.add(token);
  // In production, we would store this in Redis with an expiration
  // For this simple implementation, we'll clean up occasionally
  if (revokedTokens.size > 1000) {
    // Simple cleanup mechanism - in production use Redis with TTL
    revokedTokens.clear();
  }
};

/**
 * Middleware to authenticate requests using Firebase ID token
 * Enhanced for production with caching and security features
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const firebaseAuthMiddleware = async (req, res, next) => {
  // Check if Firebase was initialized
  if (!firebaseInitialized) {
    logger.error('Firebase auth: Firebase Admin SDK not initialized');
    return res.status(500).json({
      success: false,
      message: 'Authentication service unavailable'
    });
  }

  // Extract token from header
  const authorizationHeader = req.headers.authorization;
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    logger.warn(`Firebase auth: No Bearer token found. IP: ${req.ip}`);
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Authentication required'
    });
  }

  const idToken = authorizationHeader.split('Bearer ')[1];
  if (!idToken) {
    logger.warn(`Firebase auth: Empty token after Bearer prefix. IP: ${req.ip}`);
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid authentication format'
    });
  }

  // Security check: Reasonable token length
  if (idToken.length < 50 || idToken.length > 4096) {
    logger.warn(`Firebase auth: Suspicious token length (${idToken.length}) from IP: ${req.ip}`);
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid token format'
    });
  }

  // Check if token has been manually revoked (e.g. during logout)
  if (isTokenRevoked(idToken)) {
    logger.warn(`Firebase auth: Attempt to use revoked token. IP: ${req.ip}`);
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Token has been revoked'
    });
  }

  try {
    let decodedToken;
    
    // Check token cache first for performance
    const cached = validatedTokens.get(idToken);
    const now = Date.now() / 1000;
    
    if (cached && cached.exp > now) {
      // Use cached token if still valid
      decodedToken = cached;
      logger.debug(`Firebase auth: Using cached token for UID: ${decodedToken.uid}`);
    } else {
      // Verify with Firebase if not in cache or expired
      decodedToken = await admin.auth().verifyIdToken(idToken, true); // Check if revoked
      
      // Add to cache with 5-minute buffer before expiration
      if (decodedToken.exp) {
        validatedTokens.set(idToken, decodedToken);
        
        // Schedule cleanup of this token from cache when it expires
        setTimeout(() => {
          validatedTokens.delete(idToken);
        }, (decodedToken.exp - now - 300) * 1000); // 5 minutes before expiration
      }
    }
    
    // Clean up token cache occasionally
    if (Math.random() < 0.01) { // 1% chance on each request
      const nowSeconds = Date.now() / 1000;
      for (const [key, value] of validatedTokens.entries()) {
        if (value.exp <= nowSeconds) {
          validatedTokens.delete(key);
        }
      }
    }
    
    // Add user data to request
    req.user = decodedToken;
    req.userToken = idToken; // Store token for potential revocation on logout
    
    // For auditing in production
    logger.info(`Firebase auth: Token verified for UID: ${decodedToken.uid} from IP: ${req.ip}`);
    next();
  } catch (error) {
    // Handle various Firebase error codes with appropriate responses
    logger.error(`Firebase auth: Error verifying token: ${error.code || 'unknown'}`);
    
    // Return appropriate error based on Firebase error code
    switch(error.code) {
      case 'auth/id-token-expired':
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Authentication expired'
        });
      case 'auth/id-token-revoked':
        // Add to our local revocation list
        revokeToken(idToken);
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Authentication revoked'
        });
      case 'auth/argument-error':
        return res.status(400).json({
          success: false,
          message: 'Bad Request: Invalid authentication format'
        });
      case 'auth/invalid-id-token':
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Invalid authentication'
        });
      default:
        return res.status(403).json({
          success: false,
          message: 'Access Denied'
        });
    }
  }
};

// Export revocation function for use in logout routes
firebaseAuthMiddleware.revokeToken = revokeToken;

module.exports = firebaseAuthMiddleware;