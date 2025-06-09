const { successResponse, errorResponse } = require('../utils/response.util');
const { VAPI_CONFIG } = require('../config/constants');
const admin = require('firebase-admin');
const {Firestore} = require('@google-cloud/firestore');

// Cached Firestore client instance for duckbuck database
let duckbuckFirestoreClient = null;

// Initialize Firestore client for duckbuck database
const getFirestoreClient = (projectId, credentials) => {
  // Return cached instance if available
  if (duckbuckFirestoreClient) {
    return duckbuckFirestoreClient;
  }
  
  // Create and cache new instance for duckbuck database
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
 * Generate WebSocket URL for VAPI AI agent call
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createWebCall = async (req, res) => {
  try {
    const { uid } = req.body;

    if (!uid) {
      return errorResponse(res, 'User ID (uid) is required in request body', 400);
    }

    console.log('Checking user with UID:', uid);

    // Parse service account credentials from environment variable
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (!serviceAccount || !serviceAccount.project_id) {
        throw new Error('Invalid service account format');
      }
    } catch (parseError) {
      console.error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${parseError.message}`);
      return errorResponse(res, 'Server configuration error', 500);
    }

    const projectId = serviceAccount.project_id;

    // Connect to duckbuck database specifically
    try {
      const firestore = getFirestoreClient(projectId, serviceAccount);
      const userRef = firestore.collection('users').doc(uid);
      const userDoc = await userRef.get();
      
      console.log('User document exists:', userDoc.exists);
      
      if (!userDoc.exists) {
        console.log('User document not found for UID:', uid);
        return errorResponse(res, 'User not found', 404);
      }

      const userData = userDoc.data();
      console.log('User data retrieved:', { uid, agent_remaining_time: userData.agent_remaining_time });
      
      const agentRemainingTime = userData.agent_remaining_time;

      // Check if user has remaining time (should be integer in seconds)
      if (!agentRemainingTime || agentRemainingTime <= 0 || !Number.isInteger(agentRemainingTime)) {
        return errorResponse(res, 'No agent time remaining. Please purchase more agent time.', 403);
      }
    } catch (firestoreError) {
      console.error('Firestore error:', firestoreError);
      return errorResponse(res, 'Database error occurred while checking user', 500);
    }

    // Make request to VAPI API to create web call
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_CONFIG.API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId: VAPI_CONFIG.ASSISTANT_ID,
        transport: {
          provider: "vapi.websocket",
          audioFormat: {
            format: "pcm_s16le",
            container: "raw",
            sampleRate: 16000
          }
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      return errorResponse(res, 'Failed to create VAPI call', response.status);
    }

    const vapiResponse = await response.json();

    return successResponse(res, 'WebSocket URL generated successfully', vapiResponse);
  } catch (error) {
    console.error('Error creating VAPI web call:', error);
    return errorResponse(res, 'Failed to create web call', 500);
  }
};

module.exports = {
  createWebCall
};
