const admin = require('firebase-admin');
const logger = require('../utils/logger');
const {Firestore} = require('@google-cloud/firestore');
const {Storage} = require('@google-cloud/storage');
const emailService = require('../services/email.service');
const { getClientIp } = require('../utils/ip-helper');
const fetch = require('node-fetch'); // Added for BigDataCloud
const { LOGGING_CONFIG } = require('../config/constants');

// Cache storage bucket names to reduce API calls
const bucketCache = new Map();

// Cached Firestore client instances
let defaultFirestoreClient = null;
let duckbuckFirestoreClient = null;

// Email validation regex - basic validation with reasonable complexity
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Username validation regex - alphanumeric plus some common characters, reasonable length
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,50}$/;

// Validate email format
const isValidEmail = (email) => {
  return typeof email === 'string' && 
         email.length <= 254 && // Max email length per RFC
         EMAIL_REGEX.test(email);
};

// Validate username format - prevent injection attacks and ensure reasonable input
const isValidUsername = (username) => {
  return typeof username === 'string' && 
         username.length <= 50 && // Reasonable max length
         username.length >= 3 &&  // Reasonable min length
         USERNAME_REGEX.test(username);
};

// Lazy initialization of clients to improve startup time
const getFirestoreClient = (projectId, credentials, databaseId = null) => {
  const cacheKey = databaseId || 'default';
  
  // Return cached instance if available
  if (cacheKey === 'default' && defaultFirestoreClient) {
    return defaultFirestoreClient;
  }
  
  if (cacheKey === 'duckbuck' && duckbuckFirestoreClient) {
    return duckbuckFirestoreClient;
  }
  
  // Create and cache new instance
  const config = {
    projectId,
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key
    }
  };
  
  // Add databaseId if provided
  if (databaseId) {
    config.databaseId = databaseId;
  }
  
  const client = new Firestore(config);
  
  // Cache the client
  if (cacheKey === 'default') {
    defaultFirestoreClient = client;
  } else if (cacheKey === 'duckbuck') {
    duckbuckFirestoreClient = client;
  }
  
  return client;
};

/**
 * Send welcome email to a user
 * @route POST /api/users/send-welcome-email
 * @access Protected - Requires API key and Firebase authentication
 */
exports.sendWelcomeEmailHandler = async (req, res) => {
  try {
    const { email, username } = req.body;
    
    // Comprehensive input validation
    if (!email || !username) {
      logger.warn(`Send welcome email request missing required fields. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Email and username are required.' });
    }
    
    // Validate email format
    if (!isValidEmail(email)) {
      logger.warn(`Invalid email format in welcome email request: ${email}. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }

    // Validate username format
    if (!isValidUsername(username)) {
      logger.warn(`Invalid username format in welcome email request: ${username}. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Invalid username format.' });
    }
    
    // Authorization check: Ensure the email belongs to the authenticated user
    // This prevents users from sending emails on behalf of others
    if (req.user && req.user.email && req.user.email !== email) {
      logger.warn(`Unauthorized attempt to send welcome email to ${email} by user ${req.user.uid}. IP: ${req.ip}`);
      return res.status(403).json({ 
        success: false, 
        message: 'You can only send emails to your own email address.' 
      });
    }
    
    // Send the email
    await emailService.sendWelcomeEmail(req, email, username);
    
    // In production, don't expose too much information in the response
    res.status(200).json({ 
      success: true, 
      message: process.env.NODE_ENV === 'production' ? 
        'Welcome email sent successfully.' : 
        `Welcome email sent to ${email} successfully.` 
    });
  } catch (error) {
    logger.error('Error in sendWelcomeEmailHandler:', error);
    
    // Don't expose internal error details in production
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send welcome email.',
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
    });
  }
};

/**
 * Send login notification email to a user
 * @route POST /api/users/send-login-notification
 * @access Protected - Requires API key and Firebase authentication
 */
exports.sendLoginNotificationHandler = async (req, res) => {
  try {
    const { email, username, loginTime } = req.body;
    
    // Comprehensive input validation
    if (!email || !username) {
      logger.warn(`Send login notification request missing required fields. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Email and username are required.' });
    }
    
    // Validate email format
    if (!isValidEmail(email)) {
      logger.warn(`Invalid email format in login notification request: ${email}. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }

    // Validate username format
    if (!isValidUsername(username)) {
      logger.warn(`Invalid username format in login notification request: ${username}. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Invalid username format.' });
    }
    
    // Optional loginTime validation if provided
    if (loginTime && (typeof loginTime !== 'string' || loginTime.length > 100)) {
      logger.warn(`Invalid loginTime format in request: ${loginTime}. IP: ${req.ip}`);
      return res.status(400).json({ success: false, message: 'Invalid loginTime format.' });
    }
    
    // Format timestamp nicely if it appears to be in ISO or standard format
    if (loginTime && loginTime.match(/^\d{4}-\d{2}-\d{2}/) || loginTime.match(/^\d{4}\/\d{2}\/\d{2}/)) {
      try {
        const date = new Date(loginTime);
        if (!isNaN(date)) {
          loginTime = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
        }
      } catch (e) {
        // Keep the original format if parsing fails
      }
    }
    
    // Authorization check: Ensure the email belongs to the authenticated user
    if (req.user && req.user.email && req.user.email !== email) {
      logger.warn(`Unauthorized attempt to send login notification to ${email} by user ${req.user.uid}. IP: ${req.ip}`);
      return res.status(403).json({ 
        success: false, 
        message: 'You can only send emails to your own email address.' 
      });
    }
    
    // Send the login notification email
    await emailService.sendLoginNotification(req, email, username, loginTime);
    
    // In production, don't expose too much information in the response
    res.status(200).json({ 
      success: true, 
      message: process.env.NODE_ENV === 'production' ? 
        'Login notification email sent successfully.' : 
        `Login notification email sent to ${email} successfully.` 
    });
  } catch (error) {
    logger.error('Error in sendLoginNotificationHandler:', error);
    
    // Don't expose internal error details in production
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send login notification email.',
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
    });
  }
};

/**
 * IP Debug Endpoint to check GeoIP lookup
 * @route GET /api/users/ip-debug
 * @access Protected - Requires API key
 */
exports.ipDebug = async (req, res) => {
  // Check if IP Debug is enabled, especially in production
  if (process.env.NODE_ENV === 'production' && !LOGGING_CONFIG.DEBUG_IP) {
    logger.warn(`IP debug endpoint accessed in production while disabled. IP: ${getClientIp(req)}`);
    return res.status(403).json({
      success: false,
      message: 'Forbidden: IP Debug is not enabled in this environment.'
    });
  }

  const ipAddress = getClientIp(req);
  let locationDetails = null; // Will store the full BigDataCloud response
  let displayLocation = 'Unknown';

  const apiKey = process.env.BIGDATACLOUD_API_KEY;

  if (!apiKey) {
    logger.error('BIGDATACLOUD_API_KEY is not set for IP debug. Location lookup will fail.');
    displayLocation = 'Unknown Location (API key missing)';
  } else if (ipAddress && ipAddress !== '::1' && ipAddress !== '127.0.0.1' && ipAddress !== 'localhost') {
    try {
      const url = `https://api.bigdatacloud.net/data/ip-geolocation?ip=${ipAddress}&key=${apiKey}`;
      const response = await fetch(url);
      locationDetails = await response.json(); // Store the full response

      if (!response.ok) {
        logger.error(`BigDataCloud API error for IP ${ipAddress} in ipDebug: ${response.status} ${response.statusText}. Body: ${JSON.stringify(locationDetails)}`);
        displayLocation = 'Unknown Location (API error)';
      } else {
        let locationParts = [];
        if (locationDetails.city) locationParts.push(locationDetails.city);
        if (locationDetails.location && locationDetails.location.principalSubdivision) locationParts.push(locationDetails.location.principalSubdivision);
        if (locationDetails.country && locationDetails.country.name) locationParts.push(locationDetails.country.name);
        
        if (locationParts.length > 0) {
          displayLocation = locationParts.join(', ');
        } else {
          logger.warn(`BigDataCloud returned no specific location details for IP ${ipAddress} in ipDebug. Response: ${JSON.stringify(locationDetails)}`);
          if (locationDetails.country && locationDetails.country.name) {
            displayLocation = locationDetails.country.name; // Fallback to country
          } else {
            displayLocation = 'Location details not found';
          }
        }
      }
    } catch (error) {
      logger.error(`Error fetching geolocation from BigDataCloud for IP ${ipAddress} in ipDebug:`, error);
      displayLocation = 'Unknown Location (Fetch error)';
      locationDetails = { error: error.message }; // Store error in details
    }
  } else if (ipAddress === '::1' || ipAddress === '127.0.0.1' || ipAddress === 'localhost') {
    displayLocation = 'Local/Internal IP';
  }

  res.status(200).json({
    success: true,
    ipAddress,
    determinedLocation: displayLocation, // The string used in emails
    bigDataCloudResponse: locationDetails, // Full API response
    headers: req.headers
  });
};

/**
 * Delete a user
 * Deletes the user from Firebase Authentication and Firebase Database/Storage
 * @route DELETE /api/users/delete
 * @access Protected - Requires API key and Firebase authentication (admin or same user only)
 */
exports.deleteUser = async (req, res, next) => {
  // Start a timer to measure execution time
  const startTime = Date.now();
  
  try {
    // Get the Firebase UID from the request body
    const firebaseUid = req.body.uid;
    
    // Validate input
    if (!firebaseUid) {
      return res.status(400).json({
        success: false,
        message: 'Firebase UID is required in the request body (as "uid")'
      });
    }
    
    // Security check: Only allow users to delete themselves or admin to delete any user
    if (req.user.uid !== firebaseUid && !req.user.admin) {
      logger.warn(`Unauthorized delete attempt: User ${req.user.uid} tried to delete user ${firebaseUid}`);
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You can only delete your own account'
      });
    }

    // Parse service account credentials from environment variable
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (!serviceAccount || !serviceAccount.project_id) {
        throw new Error('Invalid service account format');
      }
    } catch (parseError) {
      logger.error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${parseError.message}`);
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    const projectId = serviceAccount.project_id;
    const results = {
      firestore: { success: false, message: null },
      storage: { success: false, message: null, deletedFiles: [] },
      auth: { success: false, message: null }
    };
    let userRecord = null; // Declare userRecord in a higher scope
    
    // Try to get bucket name from cache first
    let storageBucketName = bucketCache.get(projectId);

    // 1. Delete from Firestore and Storage in parallel
    await Promise.all([
      // Delete Firestore data
      (async () => {
        try {
          // Try duckbuck database first
          const firestore = getFirestoreClient(projectId, serviceAccount, 'duckbuck');
          
          const userRef = firestore.collection('users').doc(firebaseUid);
          const doc = await userRef.get();
          
          if (doc.exists) {
            await userRef.delete();
            results.firestore.success = true;
            results.firestore.message = 'Deleted from duckbuck database';
          } else {
            // Try default database if not found in duckbuck
            try {
              const defaultFirestore = getFirestoreClient(projectId, serviceAccount);
              
              const defaultUserRef = defaultFirestore.collection('users').doc(firebaseUid);
              const defaultDoc = await defaultUserRef.get();
              
              if (defaultDoc.exists) {
                await defaultUserRef.delete();
                results.firestore.success = true;
                results.firestore.message = 'Deleted from default database';
              } else {
                // Document doesn't exist in either database, consider it a success
                results.firestore.success = true;
                results.firestore.message = 'No user document found';
              }
            } catch (defaultDbError) {
              throw defaultDbError;
            }
          }
        } catch (dbError) {
          // Check if this is a specific database not found error
          if (dbError.code === 5 && dbError.message.includes('NOT_FOUND')) {
            try {
              // Try with the default database
              const defaultFirestore = getFirestoreClient(projectId, serviceAccount);
              
              const userRef = defaultFirestore.collection('users').doc(firebaseUid);
              const doc = await userRef.get();
              
              if (doc.exists) {
                await userRef.delete();
                results.firestore.success = true;
                results.firestore.message = 'Deleted from default database';
              } else {
                // No document found in either database - still a success
                results.firestore.success = true; 
                results.firestore.message = 'No user document found';
              }
            } catch (fallbackError) {
              throw fallbackError;
            }
          } else {
            throw dbError;
          }
        }
      })(),
      
      // Delete Storage files
      (async () => {
        try {
          const storage = new Storage({
            projectId,
            credentials: {
              client_email: serviceAccount.client_email,
              private_key: serviceAccount.private_key
            }
          });

          // Use cached bucket name or find it
          let bucketName = storageBucketName;
          
          if (!bucketName) {
            // Get available buckets
            const [buckets] = await storage.getBuckets();
            
            // Find the default bucket or one containing the project ID
            for (const bucket of buckets) {
              if (bucket.name.includes(projectId)) {
                bucketName = bucket.name;
                break;
              }
            }
            
            // If no matching bucket found, use default naming convention
            if (!bucketName) {
              bucketName = `${projectId}.appspot.com`;
            }
            
            // Cache the bucket name for future operations
            bucketCache.set(projectId, bucketName);
            storageBucketName = bucketName;
          }
        
          // Check if the bucket exists and we have access
          const [exists] = await storage.bucket(bucketName).exists();
          if (!exists) {
            results.storage.message = `Storage bucket "${bucketName}" not accessible`;
            return;
          }
          
          // Check if files exist in profile_images folder
          const [files] = await storage.bucket(bucketName).getFiles({
            prefix: `profile_images/${firebaseUid}/`
          });
          
          if (files && files.length > 0) {
            // Store file paths for reference when handling profile photo
            results.storage.deletedFiles = files.map(file => file.name);
            
            // Delete user's profile photos folder
            await storage.bucket(bucketName).deleteFiles({
              prefix: `profile_images/${firebaseUid}/`
            });
            
            results.storage.success = true;
            results.storage.message = `Deleted ${files.length} files`;
          } else {
            // No files to delete is still a success
            results.storage.success = true;
            results.storage.message = 'No files found';
          }
        } catch (storageError) {
          results.storage.message = storageError.message;
          throw storageError;
        }
      })().catch(storageError => {
        // Log but don't fail the whole operation due to storage errors
        logger.error(`Storage deletion error: ${storageError.message}`, {
          uid: firebaseUid,
          error: storageError.code || 'unknown'
        });
        // Storage errors shouldn't stop the account deletion process
        results.storage.success = false; 
      })
    ]);
    
    // 3. Now delete from Auth (must happen after Storage since we need the user record)
    try {
      // Get the user data to check if they have a profile picture URL in Auth
      userRecord = await admin.auth().getUser(firebaseUid); // Assign to the higher-scoped variable
      
      // Check and delete profile photo if not already deleted with folder
      if (userRecord.photoURL && userRecord.photoURL.includes('firebasestorage.googleapis.com')) {
        const isAlreadyDeleted = results.storage.deletedFiles.some(path => 
          userRecord.photoURL.includes(encodeURIComponent(path.split('?')[0])));
        
        if (!isAlreadyDeleted && results.storage.success) {
          try {
            const storage = new Storage({
              projectId,
              credentials: {
                client_email: serviceAccount.client_email,
                private_key: serviceAccount.private_key
              }
            });
            
            const url = new URL(userRecord.photoURL);
            
            if (url.hostname === 'firebasestorage.googleapis.com' && url.pathname.includes('/o/')) {
              const urlPathMatch = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)/);
              if (urlPathMatch && urlPathMatch[1] && urlPathMatch[2]) {
                const urlBucketName = urlPathMatch[1];
                const decodedPath = decodeURIComponent(urlPathMatch[2].split('?')[0]);
                
                // Skip if already in deleted files list
                const profileImagesPrefix = `profile_images/${firebaseUid}/`;
                if (!decodedPath.startsWith(profileImagesPrefix)) {
                  try {
                    await storage.bucket(urlBucketName).file(decodedPath).delete();
                    results.storage.deletedFiles.push(decodedPath);
                  } catch (deleteError) {
                    // Ignore 404 errors
                    if (deleteError.code !== 404) {
                      logger.debug(`Profile photo deletion error: ${deleteError.message}`);
                    }
                  }
                }
              }
            }
          } catch (photoError) {
            // Don't let profile photo issues stop the account deletion
            logger.debug(`Error processing profile photo: ${photoError.message}`);
          }
        }
      }
      
      // Delete the user account from Firebase Authentication
      await admin.auth().deleteUser(firebaseUid);
      results.auth.success = true;
      results.auth.message = 'User deleted from authentication';
      
    } catch (authError) {
      // If the user doesn't exist in Auth, consider it a success
      if (authError.code === 'auth/user-not-found') {
        results.auth.success = true;
        results.auth.message = 'User account not found in authentication';
      } else {
        results.auth.message = authError.message;
        logger.error(`Auth deletion error: ${authError.message}`, {
          uid: firebaseUid,
          code: authError.code || 'unknown'
        });
        throw authError; // Critical failure, rethrow
      }
    }
    
    // Auth deletion is critical - fail if it failed
    if (!results.auth.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete user from authentication system',
        error: results.auth.message
      });
    }
    
    // Calculate and log execution time
    const executionTime = Date.now() - startTime;
    logger.info(`User deletion completed in ${executionTime}ms`, { 
      uid: firebaseUid, 
      executionTime,
      firestoreSuccess: results.firestore.success,
      storageSuccess: results.storage.success,
      authSuccess: results.auth.success
    });
    
    // Send deletion confirmation email if we have the user's email
    try {
      // If we have the user's email and username from the authentication record
      if (userRecord && userRecord.email) {
        // Ensure username is available, fallback if not directly on userRecord
        const usernameForEmail = userRecord.displayName || userRecord.email.split('@')[0] || 'User';
        await emailService.sendAccountDeletionConfirmation(req, userRecord.email, usernameForEmail);
      }
    } catch (emailError) {
      // Log but don't fail the operation if email sending fails
      logger.error(`Error preparing deletion confirmation email: ${emailError.message}`);
    }
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: 'User account has been successfully deleted'
    });
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error(`User deletion failed after ${executionTime}ms: ${error.message}`, { 
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
    return next(error);
  }
};
