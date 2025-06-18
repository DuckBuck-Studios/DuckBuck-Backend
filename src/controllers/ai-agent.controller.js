const { RtcTokenBuilder, RtcRole } = require('agora-token');
const admin = require('firebase-admin');
const {Firestore} = require('@google-cloud/firestore');
const logger = require('../utils/logger');
const { AGORA_AI_CONFIG } = require('../config/constants');

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
 * Generate Agora RTC token for agent
 * @param {string} channelName - Channel name
 * @param {string} uid - User ID
 * @param {number} expirationTimeInSeconds - Token expiration time
 * @returns {string} - Generated token
 */
const generateAgoraToken = (channelName, uid, expirationTimeInSeconds = 3600) => {
  const { RtcTokenBuilder, RtcRole } = require('agora-token');
  
  const appId = AGORA_AI_CONFIG.APP_ID;
  const appCertificate = AGORA_AI_CONFIG.APP_CERTIFICATE;
  const role = RtcRole.PUBLISHER;
  
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
  
  return RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channelName, uid, role, privilegeExpiredTs);
};

/**
 * Start a conversational AI agent using Agora API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const joinAgent = async (req, res) => {
  try {
    const { uid, channelName } = req.body;

    if (!uid || !channelName) {
      return res.status(400).json({
        success: false,
        message: 'User ID (uid) and channel name are required'
      });
    }

    // Check user's agent remaining time from Firebase
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
        return res.status(500).json({
          success: false,
          message: 'Server configuration error'
        });
      }

      const projectId = serviceAccount.project_id;

      // Connect to duckbuck database (same as notification controller)
      const firestore = getFirestoreClient(projectId, serviceAccount);
      const userDoc = await firestore.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const userData = userDoc.data();
      const agentRemainingTime = userData.agentRemainingTime || 0; // Note: correct field name

      if (agentRemainingTime <= 0) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient agent time remaining. Please purchase more time to use AI agent.'
        });
      }
    } catch (firebaseError) {
      logger.error('Error fetching user data from Firebase duckbuck database:', firebaseError);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify user agent time'
      });
    }

    // Generate unique agent identifiers
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const agentName = `agent_${channelName}_${timestamp}_${randomId}`;
    const agentUid = `agent_${randomId}_${timestamp}`;
    
    // Generate Agora token for the agent
    let agentToken;
    try {
      agentToken = generateAgoraToken(channelName, agentUid, 3600); // 1 hour expiry
    } catch (tokenError) {
      console.error('Failed to generate Agora token:', tokenError);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate authentication token'
      });
    }

    // Prepare Agora AI agent configuration
    const agentConfig = {
      name: agentName,
      properties: {
        channel: channelName,
        token: agentToken,
        agent_rtc_uid: agentUid,
        remote_rtc_uids: ["*"], // Subscribe to all users in the channel
        enable_string_uid: true,
        idle_timeout: AGORA_AI_CONFIG.AGENT.IDLE_TIMEOUT,
        advanced_features: {
          enable_aivad: AGORA_AI_CONFIG.AGENT.ENABLE_AIVAD,
          enable_rtm: AGORA_AI_CONFIG.AGENT.ENABLE_RTM
        },
        asr: {
          language: AGORA_AI_CONFIG.ASR.LANGUAGE
        },
        tts: {
          vendor: AGORA_AI_CONFIG.TTS.VENDOR,
          params: {
            key: AGORA_AI_CONFIG.TTS.API_KEY,
            region: AGORA_AI_CONFIG.TTS.REGION,
            voice_name: AGORA_AI_CONFIG.TTS.VOICE_NAME,
            rate: AGORA_AI_CONFIG.TTS.RATE,    
            volume: AGORA_AI_CONFIG.TTS.VOLUME  
          }, 
        },
        llm: {
          url: AGORA_AI_CONFIG.LLM.URL, 
          api_key: AGORA_AI_CONFIG.LLM.API_KEY,  
          style: "openai",
          system_messages: [
            {
              role: "system",
              content: AGORA_AI_CONFIG.LLM.SYSTEM_MESSAGE
            }
          ],
          params: {
            model: AGORA_AI_CONFIG.LLM.MODEL
          },
          max_history: AGORA_AI_CONFIG.LLM.MAX_HISTORY,
          greeting_message: AGORA_AI_CONFIG.LLM.GREETING_MESSAGE,
          failure_message: AGORA_AI_CONFIG.LLM.FAILURE_MESSAGE
        },
        vad: {
          interrupt_duration_ms: AGORA_AI_CONFIG.AGENT.INTERRUPT_DURATION_MS,
          prefix_padding_ms: AGORA_AI_CONFIG.AGENT.PREFIX_PADDING_MS,
          silence_duration_ms: AGORA_AI_CONFIG.AGENT.SILENCE_DURATION_MS,
          threshold: AGORA_AI_CONFIG.AGENT.VAD_THRESHOLD
        },
        parameters: {
          interruptable: AGORA_AI_CONFIG.AGENT.INTERRUPTABLE
        }
      }
    };

    // Make request to Agora AI Agent API
    const agoraApiUrl = `${AGORA_AI_CONFIG.API_BASE_URL}/projects/${AGORA_AI_CONFIG.APP_ID}/join`;
    
    // Set timeout for the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

    let response;
    try {
      response = await fetch(agoraApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${AGORA_AI_CONFIG.BASIC_AUTH}`
        },
        body: JSON.stringify(agentConfig),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('Agora API request timed out after 25 seconds');
        return res.status(408).json({
          success: false,
          message: 'Request timed out - Agora API is not responding'
        });
      }
      
      console.error('Fetch error:', fetchError);
      return res.status(500).json({
        success: false,
        message: 'Network error occurred while contacting Agora API'
      });
    }

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Agora API error:', response.status, errorData);
      
      return res.status(response.status).json({
        success: false,
        message: 'Failed to start AI agent'
      });
    }

    const agoraResponse = await response.json();
    
    res.status(200).json({
      success: true,
      message: 'AI agent started successfully',
      data: {
        agent_id: agoraResponse.agent_id,
        agent_name: agentName,
        channel_name: channelName,
        status: agoraResponse.status,
        create_ts: agoraResponse.create_ts
      }
    });

  } catch (error) {
    console.error('Error in joinAgent:', error);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error occurred while starting AI agent'
    });
  }
};

/**
 * Stop a conversational AI agent using Agora API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const stopAgent = async (req, res) => {
  try {
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        message: 'Agent ID is required'
      });
    }

    // Make request to Agora AI Agent API to stop the agent
    const agoraApiUrl = `${AGORA_AI_CONFIG.API_BASE_URL}/projects/${AGORA_AI_CONFIG.APP_ID}/agents/${agentId}/leave`;
    
    // Set timeout for the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    let response;
    try {
      response = await fetch(agoraApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${AGORA_AI_CONFIG.BASIC_AUTH}`
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('Agora API stop request timed out after 15 seconds');
        return res.status(408).json({
          success: false,
          message: 'Stop request timed out - Agora API is not responding'
        });
      }
      
      console.error('Stop fetch error:', fetchError);
      return res.status(500).json({
        success: false,
        message: 'Network error occurred while contacting Agora API'
      });
    }

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Agora API stop error:', response.status, errorData);
      
      return res.status(response.status).json({
        success: false,
        message: 'Failed to stop AI agent',
        error: errorData
      });
    }

    // Response body is empty for successful stop requests
    res.status(200).json({
      success: true,
      message: 'AI agent stopped successfully',
      data: {
        agent_id: agentId,
        status: 'stopped'
      }
    });

  } catch (error) {
    console.error('Error in stopAgent:', error);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error occurred while stopping AI agent'
    });
  }
};

module.exports = {
  joinAgent,
  stopAgent
};