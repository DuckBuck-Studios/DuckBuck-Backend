const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Creates a middleware function that validates request data against a schema
 * @param {Object} schema - Joi schema for validation
 * @param {string} source - The request property to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
const validateSchema = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      if (!schema) {
        return next();
      }

      const dataToValidate = req[source];
      
      const options = {
        abortEarly: false, // Return all errors, not just the first one
        allowUnknown: true, // Allow unknown keys that will be ignored
        stripUnknown: false // Don't remove unknown keys
      };

      // Validate the request data against the schema
      const { error, value } = schema.validate(dataToValidate, options);

      if (error) {
        // Format validation error messages
        const errorMessages = error.details.map(detail => {
          return {
            field: detail.path.join('.'),
            message: detail.message.replace(/['"]/g, '')
          };
        });

        logger.warn(`Schema validation failed for ${req.originalUrl}:`, { 
          errors: errorMessages,
          ip: req.ip
        });

        // Production response (simplified)
        if (process.env.NODE_ENV === 'production') {
          return res.status(400).json({
            success: false,
            message: 'Invalid request data'
          });
        }

        // Development response (detailed)
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errorMessages
        });
      }

      // Replace request data with validated data
      req[source] = value;
      next();
    } catch (err) {
      logger.error(`Error in schema validation middleware: ${err.message}`, {
        stack: err.stack,
        url: req.originalUrl
      });
      return res.status(500).json({
        success: false,
        message: 'Internal server error during validation'
      });
    }
  };
};

// Common validation schemas
const schemas = {

  // Welcome email schema
  welcomeEmail: Joi.object({
    email: Joi.string()
      .email({ minDomainSegments: 2 })
      .required()
      .max(254),
    username: Joi.string()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9._-]+$/)
      .required()
      .messages({
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username must be at most 50 characters long',
        'string.pattern.base': 'Username can only contain letters, numbers, dots, underscores, and hyphens',
        'any.required': 'Username is required'
      })
  }),

  // Login notification email schema
  loginNotificationEmail: Joi.object({
    email: Joi.string()
      .email({ minDomainSegments: 2 })
      .required()
      .max(254),
    username: Joi.string()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9._-]+$/)
      .required(),
    loginTime: Joi.string()
      .max(100)
      .optional()
  }),
  
  // Schema for sending welcome email (for user.routes.js)
  sendWelcomeEmailSchema: Joi.object({
    email: Joi.string()
      .email({ minDomainSegments: 2 })
      .required()
      .max(254),
    username: Joi.string()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9._-]+$/)
      .required()
      .messages({
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username must be at most 50 characters long',
        'string.pattern.base': 'Username can only contain letters, numbers, dots, underscores, and hyphens',
        'any.required': 'Username is required'
      })
  }),

  // Schema for sending login notification email (for user.routes.js)
  sendLoginNotificationSchema: Joi.object({
    email: Joi.string()
      .email({ minDomainSegments: 2 })
      .required()
      .max(254),
    username: Joi.string()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9._-]+$/)
      .required(),
    loginTime: Joi.string()
      .max(100)
      .optional()
  }),

  // Schema for sending FCM notifications (for notification.routes.js)
  sendNotificationSchema: Joi.object({
    // Either uid or recipientUid is required, but not both
    uid: Joi.string().optional(),
    recipientUid: Joi.string().optional(),
    
    // Title is optional and can be empty
    title: Joi.string().allow('', null).optional(),
    
    // Body is required
    body: Joi.string().required(),
    
    // Data can be any type
    data: Joi.any().optional()
  })
  .custom((value, helpers) => {
    // Ensure at least one of uid or recipientUid is provided
    if (!value.uid && !value.recipientUid) {
      return helpers.error('object.missing', { 
        message: 'Either uid or recipientUid must be provided' 
      });
    }
    return value;
  })
  .unknown(true), // Allow unknown fields in the request

  // Schema for sending data-only FCM notifications (for notification.routes.js)
  sendDataOnlyNotificationSchema: Joi.object({
    uid: Joi.string()
      .min(1)
      .max(128)
      .optional()
      .messages({
        'string.empty': 'UID cannot be empty',
        'string.min': 'UID must be at least 1 character long',
        'string.max': 'UID must be at most 128 characters long'
      }),
    // Also accept recipientUid as an alias for uid
    recipientUid: Joi.string()
      .min(1)
      .max(128)
      .optional()
      .messages({
        'string.empty': 'Recipient UID cannot be empty',
        'string.min': 'Recipient UID must be at least 1 character long',
        'string.max': 'Recipient UID must be at most 128 characters long'
      }),
    data: Joi.alternatives()
      .try(
        Joi.object().unknown(true),
        Joi.string(),
        Joi.array()
      )
      .required()
      .messages({
        'any.required': 'Data is required for data-only notifications'
      })
  })
  .custom((value, helpers) => {
    // Ensure at least one of uid or recipientUid is provided
    if (!value.uid && !value.recipientUid) {
      return helpers.error('object.missing', { 
        message: 'Either uid or recipientUid must be provided' 
      });
    }
    return value;
  })
  .unknown(true),

  // Schema for generating Agora RTC tokens (for agora.routes.js)
  generateAgoraTokenSchema: Joi.object({
    channelId: Joi.string()
      .min(1)
      .max(64)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .required()
      .messages({
        'string.empty': 'Channel ID cannot be empty',
        'string.min': 'Channel ID must be at least 1 character long',
        'string.max': 'Channel ID must be at most 64 characters long',
        'string.pattern.base': 'Channel ID can only contain letters, numbers, underscores, and hyphens',
        'any.required': 'Channel ID is required'
      })
  })
  .unknown(true),

  // Schema for starting AI agent (for ai-agent.routes.js)
  joinAiAgentSchema: Joi.object({
    uid: Joi.alternatives()
      .try(
        Joi.string()
          .min(1)
          .max(128),
        Joi.number()
      )
      .required()
      .messages({
        'any.required': 'UID is required'
      }),
    channelName: Joi.string()
      .min(1)
      .max(64)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .required()
      .messages({
        'string.empty': 'Channel name cannot be empty',
        'string.min': 'Channel name must be at least 1 character long',
        'string.max': 'Channel name must be at most 64 characters long',
        'string.pattern.base': 'Channel name can only contain letters, numbers, underscores, and hyphens',
        'any.required': 'Channel name is required'
      })
  })
  .unknown(true),

  // Schema for stopping AI agent (for ai-agent.routes.js)
  stopAiAgentSchema: Joi.object({
    agentId: Joi.string()
      .min(1)
      .max(256)
      .required()
      .messages({
        'string.empty': 'Agent ID cannot be empty',
        'string.min': 'Agent ID must be at least 1 character long',
        'string.max': 'Agent ID must be at most 256 characters long',
        'any.required': 'Agent ID is required'
      })
  })
  .unknown(true)
};

module.exports = {
  validateSchema,
  schemas
};
