const { RtcTokenBuilder, RtcRole } = require('agora-token');
const admin = require('firebase-admin');
const logger = require('../utils/logger');

/**
 * Generate Agora RTC token for video calling
 * @route POST /api/agora/generate-token
 * @access Protected - Requires API key and Firebase authentication
 */
exports.generateAgoraToken = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const { uid, channelId } = req.body;

    // Note: Basic validation already handled by validateSchema middleware

    // Validate Agora configuration
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
      logger.error('Agora configuration missing: AGORA_APP_ID or AGORA_APP_CERTIFICATE not set');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    // Generate a unique Agora UID (integer between 1 and 2^32-1)
    const agoraUid = Math.floor(Math.random() * 1000000) + 1;
    
    // Set token expiration to 30 minutes from now
    const expirationTimeInSeconds = Math.floor(Date.now() / 1000) + (30 * 60); // 30 minutes
    
    // Generate Agora RTC token with Publisher role
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelId,
      agoraUid,
      RtcRole.PUBLISHER,
      expirationTimeInSeconds
    );

    const executionTime = Date.now() - startTime;
    const currentTimestamp = Date.now();
    
    logger.info(`Agora token generated successfully for user ${uid} in ${executionTime}ms`, {
      channelId,
      agoraUid,
      executionTime,
      timestamp: currentTimestamp
    });

    return res.status(200).json({
      success: true,
      message: 'Agora token generated successfully',
      data: {
        agora_token: token,
        agora_uid: agoraUid.toString(),
        agora_channelid: channelId,
        timestamp: currentTimestamp.toString()
      }
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.error(`Agora token generation failed after ${executionTime}ms: ${error.message}`, {
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      uid: req.body.uid,
      channelId: req.body.channelId
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to generate Agora token'
    });
  }
};

/**
 * Internal service method to generate Agora token for notifications
 * Used by notification service when type is 'invite'
 * @param {string} uid - User ID
 * @param {string} channelId - Agora channel ID
 * @param {string} callerPhoto - Caller's photo URL
 * @param {string} callName - Caller's name
 * @returns {Object} - Agora token data or null if error
 */
exports.generateAgoraTokenForNotification = async (uid, channelId, callerPhoto, callName) => {
  try {
    // Validate Agora configuration
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
      logger.error('Agora configuration missing for notification service');
      return null;
    }

    // Generate a unique Agora UID (integer between 1 and 2^32-1)
    const agoraUid = Math.floor(Math.random() * 1000000) + 1;
    
    // Set token expiration to 30 minutes from now
    const expirationTimeInSeconds = Math.floor(Date.now() / 1000) + (30 * 60); // 30 minutes
    
    // Generate Agora RTC token with Publisher role
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelId,
      agoraUid,
      RtcRole.PUBLISHER,
      expirationTimeInSeconds
    );

    const currentTimestamp = Date.now();
    
    logger.info(`Agora token generated for notification service`, {
      uid,
      channelId,
      agoraUid,
      timestamp: currentTimestamp
    });

    return {
      agora_token: token,
      agora_uid: agoraUid.toString(),
      agora_channelid: channelId,
      call_name: callName,
      caller_photo: callerPhoto,
      timestamp: currentTimestamp.toString()
    };

  } catch (error) {
    logger.error(`Agora token generation failed for notification service: ${error.message}`, {
      uid,
      channelId,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
    
    return null;
  }
};
