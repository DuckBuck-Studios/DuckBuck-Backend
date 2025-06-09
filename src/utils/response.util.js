/**
 * Standardized response utility functions for consistent API responses
 */

/**
 * Send a successful response
 * @param {Object} res - Express response object
 * @param {string} message - Success message
 * @param {Object} data - Response data (optional)
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {Object} JSON response
 */
const successResponse = (res, message, data = null, statusCode = 200) => {
  const response = {
    success: true,
    message: message
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send an error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 400)
 * @param {Object} errors - Additional error details (optional)
 * @returns {Object} JSON response
 */
const errorResponse = (res, message, statusCode = 400, errors = null) => {
  const response = {
    success: false,
    message: message
  };

  if (errors !== null) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send a validation error response
 * @param {Object} res - Express response object
 * @param {Object} errors - Validation error details
 * @returns {Object} JSON response
 */
const validationErrorResponse = (res, errors) => {
  return errorResponse(res, 'Validation failed', 422, errors);
};

/**
 * Send an unauthorized response
 * @param {Object} res - Express response object
 * @param {string} message - Error message (optional)
 * @returns {Object} JSON response
 */
const unauthorizedResponse = (res, message = 'Unauthorized access') => {
  return errorResponse(res, message, 401);
};

/**
 * Send a forbidden response
 * @param {Object} res - Express response object
 * @param {string} message - Error message (optional)
 * @returns {Object} JSON response
 */
const forbiddenResponse = (res, message = 'Forbidden access') => {
  return errorResponse(res, message, 403);
};

/**
 * Send a not found response
 * @param {Object} res - Express response object
 * @param {string} message - Error message (optional)
 * @returns {Object} JSON response
 */
const notFoundResponse = (res, message = 'Resource not found') => {
  return errorResponse(res, message, 404);
};

/**
 * Send an internal server error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message (optional)
 * @returns {Object} JSON response
 */
const internalServerErrorResponse = (res, message = 'Internal server error') => {
  return errorResponse(res, message, 500);
};

module.exports = {
  successResponse,
  errorResponse,
  validationErrorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  internalServerErrorResponse
};
