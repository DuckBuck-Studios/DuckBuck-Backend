/**
 * Application Configuration Constants
 * This file contains hardcoded configuration values that don't need to change between environments
 */

const { getSystemPrompt } = require('./prompt-loader');

// Rate Limiting Configuration
const RATE_LIMITING = {
  API: {
    LIMIT: 50,
    WINDOW_MS: 900000 // 15 minutes
  },
  EMAIL: {
    LIMIT: 10,
    WINDOW_MS: 3600000 // 1 hour
  }
};

// Security Configuration
const SECURITY_CONFIG = {
  REQUEST_TIMEOUT_MS: 30000,
  ENABLE_HTTPS_REDIRECT: true,
  TRUST_PROXY: true,
  PROXY_COUNT: 1,
  CSP_DIRECTIVES: "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
  IP_BLACKLIST: {
    THRESHOLD: 50,
    WINDOW_MS: 3600000 // 1 hour
  }
};

// Email Configuration
const EMAIL_CONFIG = {
  HOST: 'smtp.gmail.com',
  PORT: 465,
  SECURE: true
};

// Logging Configuration
const LOGGING_CONFIG = {
  LEVEL: 'info',
  SANITIZE_LOGS: true,
  DEBUG_IP: true
};

// Development Configuration
const DEVELOPMENT_CONFIG = {
  ENABLE_RATE_LIMIT_IN_DEV: false  // Set to true to enable rate limiting in development
};

// Agora AI Agent Configuration
const AGORA_AI_CONFIG = {
  APP_ID: process.env.AGORA_APP_ID,
  APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE,
  CUSTOMER_ID: process.env.AGORA_CUSTOMER_ID,
  CUSTOMER_SECRET: process.env.AGORA_CUSTOMER_SECRET,
  API_BASE_URL: 'https://api.agora.io/api/conversational-ai-agent/v2',
  BASIC_AUTH: Buffer.from(`${process.env.AGORA_CUSTOMER_ID}:${process.env.AGORA_CUSTOMER_SECRET}`).toString('base64'),
  
  // TTS Configuration - Microsoft Azure (Updated per Agora Support #4716)
  TTS: {
    VENDOR: 'microsoft',
    API_KEY: process.env.AZURE_TTS_API_KEY,
    REGION: process.env.AZURE_TTS_REGION,
    VOICE_NAME: process.env.AZURE_TTS_VOICE_NAME,
    RATE: 1,         
    VOLUME: 70       
  },
  
  // LLM Configuration - Gemini AI
  LLM: {
    URL: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    API_KEY: process.env.GEMINI_API_KEY,
    MODEL: 'gemini-2.0-flash-exp',
    MAX_HISTORY: 16,
    GREETING_MESSAGE: 'Hi! I am DuckBuck AI. How can I help you?',
    FAILURE_MESSAGE: 'I apologize, but something went wrong. Please try again. / क्षमा करें, कुछ गलत हो गया। कृपया फिर से कोशिश करें।',
    SYSTEM_MESSAGE: getSystemPrompt()
  },
  
  // ASR Configuration
  ASR: {
    LANGUAGE: 'hi-IN'   
  },
  
  // Agent Configuration
  AGENT: {
    IDLE_TIMEOUT: 30,
    ENABLE_AIVAD: true,
    ENABLE_RTM: false,
    VAD_THRESHOLD: 0.5,
    SILENCE_DURATION_MS: 640,
    INTERRUPT_DURATION_MS: 160,
    PREFIX_PADDING_MS: 300,
    INTERRUPTABLE: 'interrupt'
  }
};

module.exports = {
  RATE_LIMITING,
  SECURITY_CONFIG,
  EMAIL_CONFIG,
  LOGGING_CONFIG,
  DEVELOPMENT_CONFIG,
  AGORA_AI_CONFIG
};
