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
  // Email schema used for waitlist, contact forms, etc.
  email: Joi.object({
    email: Joi.string()
      .email({ minDomainSegments: 2, tlds: { allow: true } })
      .required()
      .max(254)
      .messages({
        'string.email': 'Please provide a valid email address',
        'string.empty': 'Email cannot be empty',
        'any.required': 'Email is required',
        'string.max': 'Email must be at most 254 characters long'
      })
  }),

  // Contact message schema
  contactMessage: Joi.object({
    name: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-zA-Z0-9\s\-'.]+$/)
      .required()
      .messages({
        'string.min': 'Name must be at least 2 characters long',
        'string.max': 'Name must be at most 50 characters long',
        'string.pattern.base': 'Name can only contain letters, numbers, spaces, hyphens, apostrophes, and periods',
        'any.required': 'Name is required'
      }),
    email: Joi.string()
      .email({ minDomainSegments: 2, tlds: { allow: true } })
      .required()
      .max(254)
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
      }),
    message: Joi.string()
      .min(10)
      .max(2000)
      .required()
      .messages({
        'string.min': 'Message must be at least 10 characters long',
        'string.max': 'Message cannot exceed 2000 characters',
        'any.required': 'Message is required'
      })
  }),

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
  })
};

module.exports = {
  validateSchema,
  schemas
};
