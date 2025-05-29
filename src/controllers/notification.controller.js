const admin = require('firebase-admin');
const logger = require('../utils/logger');
const {Firestore} = require('@google-cloud/firestore');

// Cached Firestore client instance for duckbuck database only
let duckbuckFirestoreClient = null;

// Initialization of Firestore client for duckbuck database only
const getFirestoreClient = (projectId, credentials) => {
  // Return cached instance if available
  if (duckbuckFirestoreClient) {
    return duckbuckFirestoreClient;
  }
  
  // Create and cache new instance for duckbuck database only
  const config = {
    projectId,
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key
    },
    databaseId: 'duckbuck' // Always use duckbuck database
  };
  
  const client = new Firestore(config);
  duckbuckFirestoreClient = client;
  
  return client;
};

/**
 * Get FCM token for a user from Firestore
 * @param {string} uid - Firebase UID of the user
 * @returns {string|null} - FCM token or null if not found
 */
const getFCMTokenForUser = async (uid) => {
  try {
    // Parse service account credentials from environment variable
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (!serviceAccount || !serviceAccount.project_id) {
        throw new Error('Invalid service account format');
      }
    } catch (parseError) {
      logger.error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${parseError.message}`);
      throw new Error('Server configuration error');
    }

    const projectId = serviceAccount.project_id;

    // Connect only to duckbuck database
    try {
      const firestore = getFirestoreClient(projectId, serviceAccount);
      const userRef = firestore.collection('users').doc(uid);
      const doc = await userRef.get();
      
      if (doc.exists) {
        const userData = doc.data();
        
        // Access the token from fcmTokenData as shown in the screenshot
        if (userData.fcmTokenData && userData.fcmTokenData.token) {
          const platform = userData.fcmTokenData.platform || 'unknown';
          logger.info(`FCM token found for user ${uid} on platform ${platform}`);
          return userData.fcmTokenData.token;
        }
        
        // Fallback to old structure if exists
        if (userData.fcmToken) {
          logger.info(`FCM token found for user ${uid} using legacy token field`);
          return userData.fcmToken;
        }
      }
      
      logger.warn(`No FCM token found for user ${uid} in duckbuck database`);
      return null;
    } catch (dbError) {
      logger.error(`Error accessing duckbuck database: ${dbError.message}`, { 
        uid,
        error: dbError.stack 
      });
      throw dbError;
    }
  } catch (error) {
    logger.error(`Error getting FCM token for user ${uid}: ${error.message}`, {
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Send a regular FCM notification with title and body
 * @route POST /api/notifications/send-notification
 * @access Protected - Requires API key and Firebase authentication
 */
exports.sendNotification = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    // Support both uid and recipientUid fields
    const { uid, recipientUid, title, body, data = {} } = req.body;
    const userUid = uid || recipientUid;

    // Validate input
    if (!userUid) {
      return res.status(400).json({
        success: false,
        message: 'User UID is required'
      });
    }

    // Get FCM token for the user
    const fcmToken = await getFCMTokenForUser(userUid);
    
    if (!fcmToken) {
      return res.status(404).json({
        success: false,
        message: 'FCM token not found for user'
      });
    }

    // Prepare notification payload
    const message = {
      token: fcmToken,
      data: {
        ...data,
        timestamp: Date.now().toString()
      }
    };

    // Add notification fields if body is provided (title is optional)
    if (body) {
      message.notification = {
        body: body.trim()
      };
      
      // Only add title if it's provided and not empty
      if (title && title.trim() !== '') {
        message.notification.title = title.trim();
      }
      
      message.data.type = 'notification';
      
      message.android = {
        priority: 'normal',
        notification: {
          priority: 'default',
          channelId: 'default_channel',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          sound: 'default'
        }
      };
      
      message.apns = {
        headers: {
          'apns-priority': '5'
        },
        payload: {
          aps: {
            priority: 5,
            sound: 'default',
            badge: 1
          }
        }
      };
    } else {
      // If no title/body, treat it like a data-only notification
      message.data.type = 'data_only';
      message.data.priority = 'high';
      
      message.android = {
        priority: 'high',
        ttl: 0, // Deliver immediately
        directBootOk: true,
        data: {
          ...data,
          priority: 'high',
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        }
      };
      
      message.apns = {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'background',
          'apns-topic': process.env.APPLE_BUNDLE_ID || 'com.duckbuck.app'
        },
        payload: {
          aps: {
            'content-available': 1, // Silent background notification
            priority: 10
          }
        }
      };
    }

    // Send notification
    const response = await admin.messaging().send(message);
    
    const executionTime = Date.now() - startTime;
    logger.info(`FCM notification sent successfully to user ${userUid} in ${executionTime}ms`, {
      messageId: response,
      title,
      body,
      executionTime
    });

    return res.status(200).json({
      success: true,
      message: 'Notification sent successfully',
      messageId: response
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // Handle FCM specific errors
    if (error.code === 'messaging/registration-token-not-registered') {
      logger.warn(`FCM token invalid or unregistered for user: ${req.body.uid}`);
      return res.status(410).json({
        success: false,
        message: 'FCM token is invalid or unregistered'
      });
    }
    
    if (error.code === 'messaging/invalid-argument') {
      logger.warn(`Invalid FCM message format: ${error.message}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid notification format'
      });
    }

    logger.error(`FCM notification failed after ${executionTime}ms: ${error.message}`, { 
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      uid: req.body.uid
    });
    
    return next(error);
  }
};

/**
 * Send a data-only FCM notification with high priority
 * @route POST /api/notifications/send-data-only-notification
 * @access Protected - Requires API key and Firebase authentication
 */
exports.sendDataOnlyNotification = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    // Support both uid and recipientUid fields
    const { uid, recipientUid, data = {} } = req.body;
    const userUid = uid || recipientUid;

    // Validate input
    if (!userUid) {
      return res.status(400).json({
        success: false,
        message: 'User UID is required'
      });
    }

    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Data payload is required for data-only notification'
      });
    }

    // Get FCM token for the user
    const fcmToken = await getFCMTokenForUser(userUid);
    
    if (!fcmToken) {
      return res.status(404).json({
        success: false,
        message: 'FCM token not found for user'
      });
    }

    // Prepare data-only payload with high priority
    const message = {
      token: fcmToken,
      data: {
        ...data,
        type: 'data_only',
        timestamp: Date.now().toString(),
        priority: 'high' // Add priority to the data payload for Flutter/Android
      },
      android: {
        priority: 'high',
        ttl: 0, // Deliver immediately
        directBootOk: true, // Deliver in direct boot mode if possible
        data: {
          ...data,
          priority: 'high',
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        headers: {
          'apns-priority': '10', // High priority
          'apns-push-type': 'background',
          'apns-topic': process.env.APPLE_BUNDLE_ID || 'com.duckbuck.app' // App bundle ID
        },
        payload: {
          aps: {
            'content-available': 1, // Silent background notification
            priority: 10
          }
        }
      }
    };

    // Send data-only notification
    const response = await admin.messaging().send(message);
    
    const executionTime = Date.now() - startTime;
    logger.info(`FCM data-only notification sent successfully to user ${userUid} in ${executionTime}ms`, {
      messageId: response,
      dataKeys: Object.keys(data),
      executionTime
    });

    return res.status(200).json({
      success: true,
      message: 'Data-only notification sent successfully',
      messageId: response
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // Handle FCM specific errors
    if (error.code === 'messaging/registration-token-not-registered') {
      logger.warn(`FCM token invalid or unregistered for user: ${req.body.uid}`);
      return res.status(410).json({
        success: false,
        message: 'FCM token is invalid or unregistered'
      });
    }
    
    if (error.code === 'messaging/invalid-argument') {
      logger.warn(`Invalid FCM message format: ${error.message}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid notification format'
      });
    }

    logger.error(`FCM data-only notification failed after ${executionTime}ms: ${error.message}`, { 
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      uid: req.body.uid
    });
    
    return next(error);
  }
};
