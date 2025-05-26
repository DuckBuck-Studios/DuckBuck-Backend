const path = require('path');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { getClientIp } = require('../utils/ip-helper');
const fs = require('fs'); // fs is still used by getEmailHtml
const fetch = require('node-fetch'); // Added for BigDataCloud

// Setup for email configuration
// All email configuration should come from environment variables
const PRIMARY_EMAIL = process.env.EMAIL_AUTH_ADDRESS;
const SENDER_EMAIL = process.env.GMAIL_EMAIL;

// Nodemailer transporter setup
// For Gmail/Google Workspace, an "App Password" is required if 2FA is enabled
// See: https://support.google.com/accounts/answer/185833
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE,
  auth: {
    user: PRIMARY_EMAIL, // Authentication email address
    pass: process.env.GMAIL_APP_PASSWORD, // App Password from .env
  },
  // Production settings for better reliability
  pool: true, // Use connection pool for better performance
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 1000, // Limit to 1 message per second
  rateLimit: 5, // 5 messages in each rateDelta period
});

/**
 * Fetches geolocation data from BigDataCloud API.
 * @param {string} ipAddress - The IP address to geolocate.
 * @returns {Promise<string>} A string describing the location, or an error message.
 */
const getGeoLocationFromBigDataCloud = async (ipAddress) => {
  const apiKey = process.env.BIGDATACLOUD_API_KEY;
  if (!apiKey) {
    logger.error('BIGDATACLOUD_API_KEY is not set. Location lookups will use default.');
    return 'Unknown Location (API key missing)';
  }

  if (!ipAddress || ipAddress === '::1' || ipAddress === '127.0.0.1' || ipAddress === 'localhost') {
    return 'Local/Internal IP';
  }

  try {
    const url = `https://api.bigdatacloud.net/data/ip-geolocation?ip=${ipAddress}&key=${apiKey}&localityLanguage=en`; // Added localityLanguage=en
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`BigDataCloud API error for IP ${ipAddress}: ${response.status} ${response.statusText}. Body: ${errorText}`);
      return 'Unknown Location (API error)';
    }
    const data = await response.json();
    
    let locationParts = [];
    // Prioritize localityName, then city
    if (data.location && data.location.localityName) {
      locationParts.push(data.location.localityName);
    } else if (data.city) {
      locationParts.push(data.city);
    }

    if (data.location && data.location.principalSubdivision) {
      locationParts.push(data.location.principalSubdivision);
    }
    if (data.country && data.country.name) {
      locationParts.push(data.country.name);
    }
    
    if (locationParts.length > 0) {
      return locationParts.join(', ');
    } else {
      logger.warn(`BigDataCloud returned no specific location details for IP ${ipAddress}. Response: ${JSON.stringify(data)}`);
      // Fallback to country name if available and other parts are missing
      if (data.country && data.country.name) {
        return data.country.name; // Return only country name if other details are sparse
      }
      return 'Location details not found';
    }
  } catch (error) {
    logger.error(`Error fetching geolocation from BigDataCloud for IP ${ipAddress}:`, error);
    return 'Unknown Location (Fetch error)';
  }
};

/**
 * Reads an HTML email template and replaces placeholders.
 * @param {string} templateName - The name of the template file (e.g., 'welcome').
 * @param {Object} data - An object containing data to replace placeholders.
 * @returns {string} The processed HTML content.
 */
const getEmailHtml = (templateName, data) => {
  try {
    // Path to HTML template files
    const templatePath = path.join(__dirname, '..', 'templates', 'html', `${templateName}.html`);
    
    // Read the template file
    let htmlContent = fs.readFileSync(templatePath, 'utf8');
    
    // Replace placeholders in the template with actual data
    // This is a simple approach - for more complex templates consider using a template engine like Handlebars
    if (templateName === 'welcome') {
      htmlContent = htmlContent.replace(/{{username}}/g, data.username || 'User')
                              .replace(/{{ipAddress}}/g, data.ipAddress || 'N/A')
                              .replace(/{{location}}/g, data.location || 'N/A');
    } else if (templateName === 'login-notification') {
      htmlContent = htmlContent.replace(/{{username}}/g, data.username || 'User')
                              .replace(/{{loginTime}}/g, data.loginTime || 'N/A')
                              .replace(/{{loginIp}}/g, data.ipAddress || 'N/A') // Ensure this placeholder matches the template
                              .replace(/{{loginLocation}}/g, data.location || 'N/A'); // Ensure this placeholder matches the template
    } else if (templateName === 'account-deletion') {
      htmlContent = htmlContent.replace(/{{username}}/g, data.username || 'User')
                              .replace(/{{deletionTime}}/g, data.deletionTime || 'N/A');
                              // Removed ipAddress and location replacement
    }
    
    return htmlContent;
  } catch (error) {
    logger.error(`Error reading email template ${templateName}:`, error);
    
    // Fallback to inline templates if file reading fails
    const commonFooter = `
      <p><small>If you did not request this email, please ignore it.</small></p>
      <p><small>This is an automated message from DuckBuck.</small></p>
    `;

    if (templateName === 'welcome') {
      return `
        <h1>Welcome to DuckBuck, ${data.username}!</h1>
        <p>We are excited to have you on board.</p>
        <p>Your account was registered from IP address: ${data.ipAddress || 'N/A'}</p>
        <p>Approximate location: ${data.location || 'N/A'}</p>
        ${commonFooter}
      `;
    } else if (templateName === 'login-notification' || templateName === 'login_notification') {
      return `
        <h1>Login Notification - DuckBuck</h1>
        <p>Hello ${data.username},</p>
        <p>We detected a new login to your account at ${data.loginTime}.</p>
        <p>Login details:</p>
        <ul>
          <li>IP Address: ${data.ipAddress || 'N/A'}</li>
          <li>Approximate Location: ${data.location || 'N/A'}</li>
        </ul>
        <p>If this was not you, please secure your account immediately.</p>
        ${commonFooter}
      `;
    } else if (templateName === 'account-deletion') {
      return `
        <h1>Account Deletion Confirmation - DuckBuck</h1>
        <p>Hello ${data.username},</p>
        <p>Your account has been successfully deleted.</p>
        <p>Deletion details:</p>
        <ul>
          <li>Deletion Time: ${data.deletionTime || 'N/A'}</li>
        </ul>
        <p>If you did not request this deletion, please contact support immediately.</p>
        ${commonFooter}
      `;
    }
    
    return `<p>Email content could not be generated.</p>`;
  }
};

/**
 * Sends a welcome email to the user.
 * @param {Object} req - The Express request object (contains req.user from Firebase auth).
 * @param {string} email - The recipient's email address.
 * @param {string} username - The recipient's username.
 */
/**
 * Rate limiter for individual email addresses (prevent spam)
 * Tracks emails per recipient to prevent excessive emails to same address
 */
const emailRecipientTracker = new Map();

/**
 * Check if an email has been sent to this recipient recently
 * @param {string} email - The recipient's email address
 * @returns {boolean} - Whether the email should be rate limited
 */
const shouldRateLimitRecipient = (email) => {
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000; // 24 hours window
  const maxEmails = 5; // Max 5 emails per recipient per day
  
  // Clean up old entries
  if (Math.random() < 0.01) { // 1% chance to clean up on each call
    for (const [key, data] of emailRecipientTracker.entries()) {
      if (now - data.timestamp > windowMs) {
        emailRecipientTracker.delete(key);
      }
    }
  }
  
  const recipientData = emailRecipientTracker.get(email) || { count: 0, timestamp: now };
  
  // If entry is old, reset it
  if (now - recipientData.timestamp > windowMs) {
    recipientData.count = 1;
    recipientData.timestamp = now;
    emailRecipientTracker.set(email, recipientData);
    return false;
  }
  
  // Check if over limit
  if (recipientData.count >= maxEmails) {
    return true;
  }
  
  // Increment count
  recipientData.count++;
  emailRecipientTracker.set(email, recipientData);
  return false;
};

exports.sendWelcomeEmail = async (req, email, username) => {
  try {
    // Rate limiting check for individual recipients
    if (shouldRateLimitRecipient(email)) {
      logger.warn(`Rate limit exceeded for welcome email to: ${email}`);
      return; // Do not send email if rate limited
    }

    const ipAddress = getClientIp(req);
    const location = await getGeoLocationFromBigDataCloud(ipAddress); // Changed to BigDataCloud

    logger.info(`Attempting to send welcome email to: ${email} for user: ${username} (UID: ${req.user ? req.user.uid : 'N/A'}), IP: ${ipAddress}, Location: ${location}`);

    const htmlContent = getEmailHtml('welcome', {
      username,
      ipAddress,
      location
    });

    const mailOptions = {
      from: `DuckBuck <${SENDER_EMAIL}>`, // Use the alias address configured at the top
      to: email,
      subject: 'Welcome to DuckBuck!',
      html: htmlContent,
      replyTo: SENDER_EMAIL, // Set reply-to to the same alias
      envelope: {
        from: PRIMARY_EMAIL, // This is critical: envelope.from must be the authenticated address
        to: email
      },
      // Production best practices
      priority: 'high', // Mark as high priority
      headers: {
        'X-Entity-Ref-ID': `welcome-${Date.now()}-${Math.random().toString(36).substring(2, 15)}` // Unique message ID to prevent duplicates
      }
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Welcome email sent to ${email}.`);
  } catch (error) {
    logger.error(`Error in sendWelcomeEmail service for ${email}:`, error);
    // In production we'll still not throw the error to prevent breaking the signup flow
    // But we could implement a retry mechanism or queue with Bull/Redis in a more robust setup
    
    // Security measure: if we consistently fail to send emails, track this for abuse prevention
    if (error.code === 'EAUTH' || error.responseCode >= 500) {
      // This would be a good place to implement a notification system to alert admins
      logger.warn(`SMTP auth failure or server error when sending to ${email}`);
    }
  }
};

/**
 * Sends a login notification email to the user.
 * @param {Object} req - The Express request object (contains req.user from Firebase auth).
 * @param {string} email - The recipient's email address.
 * @param {string} username - The recipient's username.
 * @param {string} [loginTime] - The time of login (optional).
 */
exports.sendLoginNotification = async (req, email, username, loginTime) => {
  try {
    // Rate limiting check for individual recipients
    if (shouldRateLimitRecipient(email)) {
      logger.warn(`Rate limit exceeded for login notification to: ${email}`);
      return; // Do not send email if rate limited
    }

    // Format date nicely with AM/PM, whether it's passed in or generated now
    const dateToProcess = loginTime ? new Date(loginTime) : new Date();
    // Validate the date before formatting
    const formattedTimeOfLogin = (dateToProcess instanceof Date && !isNaN(dateToProcess))
      ? dateToProcess.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
      : 'Invalid Date';

    const ipAddress = getClientIp(req);
    const location = await getGeoLocationFromBigDataCloud(ipAddress); // Changed to BigDataCloud

    logger.info(`Attempting to send login notification to: ${email} for user: ${username}, IP: ${ipAddress}, Location: ${location}, Login Time: ${formattedTimeOfLogin}`);

    const htmlContent = getEmailHtml('login-notification', {
      username,
      loginTime: formattedTimeOfLogin,
      ipAddress,
      location
    });

    const mailOptions = {
      from: `DuckBuck <${SENDER_EMAIL}>`, // Use the alias address configured at the top
      to: email,
      subject: 'Login Notification - DuckBuck',
      html: htmlContent,
      replyTo: SENDER_EMAIL, // Set reply-to to the same alias
      envelope: {
        from: PRIMARY_EMAIL, // This is critical: envelope.from must be the authenticated address
        to: email
      },
      // Production best practices
      priority: 'high', // Security notifications should be high priority
      headers: {
        'X-Entity-Ref-ID': `login-${Date.now()}-${Math.random().toString(36).substring(2, 15)}` // Unique message ID to prevent duplicates
      }
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Login notification email sent to ${email}.`);
  } catch (error) {
    logger.error(`Error in sendLoginNotification service for ${email}:`, error);
    
    // In production we'll still not throw the error to prevent breaking the login flow
    // But we can implement more sophisticated error handling
    
    // Security measure: track failed security notifications as they're important
    if (error.code === 'EAUTH' || error.responseCode >= 500) {
      // This would be a good place to implement a notification system to alert admins
      // For critical security notifications, we might want to attempt retry or use a fallback method
      logger.warn(`SMTP error for security notification to ${email}. This is a critical failure.`);
    }
  }
};

/**
 * Sends a account deletion confirmation email to the user.
 * @param {Object} req - The Express request object.
 * @param {string} email - The recipient's email address.
 * @param {string} username - The recipient's username.
 * @param {string} [deletionTime] - The time of account deletion (optional).
 */
exports.sendAccountDeletionConfirmation = async (req, email, username, deletionTime) => {
  try {
    // Rate limiting check for individual recipients
    if (shouldRateLimitRecipient(email)) {
      logger.warn(`Rate limit exceeded for account deletion confirmation to: ${email}`);
      return;
    }

    const dateToProcess = deletionTime ? new Date(deletionTime) : new Date();
    const formattedTimeOfDeletion = (dateToProcess instanceof Date && !isNaN(dateToProcess))
      ? dateToProcess.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
      : 'Invalid Date';

    // Removed IP address and location fetching
    // const ipAddress = getClientIp(req);
    // const location = await getGeoLocationFromBigDataCloud(ipAddress);

    logger.info(`Attempting to send account deletion confirmation to: ${email} for user: ${username}, Deletion Time: ${formattedTimeOfDeletion}`);

    const htmlContent = getEmailHtml('account-deletion', {
      username,
      deletionTime: formattedTimeOfDeletion
      // Removed ipAddress and location
    });

    const mailOptions = {
      from: `DuckBuck <${SENDER_EMAIL}>`,
      to: email,
      subject: 'Account Deletion Confirmation - DuckBuck',
      html: htmlContent,
      replyTo: SENDER_EMAIL,
      envelope: {
        from: PRIMARY_EMAIL,
        to: email
      },
      // Production best practices
      priority: 'high', // Account deletion is a high priority notification
      headers: {
        'X-Entity-Ref-ID': `deletion-${Date.now()}-${Math.random().toString(36).substring(2, 15)}` // Unique message ID to prevent duplicates
      }
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Account deletion confirmation email sent to ${email}.`);
  } catch (error) {
    logger.error(`Error in sendAccountDeletionConfirmation service for ${email}:`, error);
    
    // We'll log the error but not throw it to prevent breaking the account deletion flow
    // This is a non-critical operation compared to the actual account deletion
    
    if (error.code === 'EAUTH' || error.responseCode >= 500) {
      logger.warn(`SMTP error for account deletion notification to ${email}. Consider alternative notification channel.`);
    }
  }
};