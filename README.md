# DuckBuck Backend

Backend service for Firebase Cloud Messaging and Agora token generation. This service powers the DuckBuck application, providing APIs for waitlist registration, contact messaging, and real-time communication.

## Features

- Firebase Cloud Messaging (FCM) integration
- Agora token generation for real-time communication
- RESTful API architecture
- MongoDB database integration
- Comprehensive security measures:
  - Helmet for setting security headers
  - XSS protection
  - MongoDB injection prevention
  - HTTP Parameter Pollution prevention
  - Rate limiting
  - HTTPS redirects in production
- API key authentication
- Request validation with Joi
- Logging with Winston
- Request timeout handling
- Health check endpoint

## Prerequisites

- Node.js >= 18.0.0
- MongoDB
- Firebase Admin SDK credentials
- Agora App ID and certificate

## Environment Variables

Create a `.env` file in the root directory using the provided `.env.example` as a template. Key variables include:

```env
# Server
PORT=8080
NODE_ENV=production
TRUST_PROXY=true
REQUEST_TIMEOUT_MS=30000

# API Rate Limiting
API_RATE_WINDOW_MS=900000  # 15 minutes in milliseconds
API_RATE_LIMIT=100

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database

# Firebase
FIREBASE_PROJECT_ID=your-project-id
# For production, use base64 encoded service account JSON
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"your-project",...}

# Email Configuration
EMAIL_AUTH_ADDRESS=admin@yourdomain.com
GMAIL_EMAIL=no-reply@yourdomain.com
GMAIL_APP_PASSWORD=your-app-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
FIREBASE_CLIENT_EMAIL=your-client-email

# Agora
AGORA_APP_ID=your-agora-app-id
AGORA_APP_CERTIFICATE=your-agora-app-certificate

# Security
CSP_DIRECTIVES={"defaultSrc":["'self'"],"imgSrc":["'self'","data:"],"styleSrc":["'self'","'unsafe-inline'"],"scriptSrc":["'self'"],"connectSrc":["'self'"]}
```

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/duckbuck-backend.git
cd duckbuck-backend

# Install dependencies
npm install
```

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

## API Routes

### Waitlist Registration

- `POST /api/waitlist`: Register a new user for the waitlist

### Contact/Message

- `POST /api/contact`: Submit a contact form message

### Health Check

- `GET /health`: Get server health status

## Project Structure

```
duckbuck-backend/
├── logs/                 # Log files
├── src/
│   ├── config/           # Configuration files
│   ├── controllers/      # Route controllers
│   ├── middlewares/      # Express middlewares
│   ├── models/           # Mongoose models
│   ├── routes/           # Express routes
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   ├── validators/       # Request validators
│   └── index.js          # Entry point
├── .env                  # Environment variables (not in repo)
├── .gitignore            # Git ignore file
├── package.json          # Project metadata and dependencies
└── README.md             # Project documentation
```

## Deployment

The application is configured for production deployment with the following features:

- HTTPS redirect in production environments
- Trust proxy settings for running behind load balancers
- Graceful shutdown handling
- Error and exception handling
- Response compression
- Resource monitoring in the health check endpoint

## Error Handling

The application has comprehensive error handling for:
- Request validation errors
- Database errors including duplicate keys
- Rate limiting
- Request timeouts
- Unhandled rejections and exceptions

## Security Considerations

This application implements multiple layers of security:
- Helmet for HTTP headers
- XSS protection with xss-clean
- MongoDB query injection protection
- Parameter pollution prevention
- Rate limiting
- CORS configuration

## Email Service

The application includes a robust email service for sending transactional emails:

### Features

- Welcome emails for new user registrations
- Login notification emails for security
- Production-ready HTML templates
- Google Workspace / Gmail integration
- Support for email aliases
- Rate limiting to prevent abuse
- Error handling with comprehensive logging

### Email Configuration

To set up the email service:

1. **Create App Password for Gmail**:
   - Go to your Google Account > Security
   - Enable 2-Step Verification if not already enabled
   - Create an App Password for the application
   - Use this password in the `GMAIL_APP_PASSWORD` environment variable

2. **Email Alias Setup** (if using an alias like no-reply@yourdomain.com):
   - Configure the alias in Google Workspace Admin Console
   - Set `EMAIL_AUTH_ADDRESS` to your primary email that owns the alias
   - Set `GMAIL_EMAIL` to the alias email address

3. **Environment Variables**:
   - `EMAIL_AUTH_ADDRESS`: Primary email for authentication
   - `GMAIL_EMAIL`: Email address to send from (can be an alias)
   - `GMAIL_APP_PASSWORD`: App password generated from Google
   - `EMAIL_HOST`: SMTP server host (default: smtp.gmail.com)
   - `EMAIL_PORT`: SMTP port (default: 465 for SSL)
   - `EMAIL_SECURE`: Whether to use SSL (default: true)
   - `EMAIL_RATE_WINDOW_MS`: Rate limiting window in milliseconds
   - `EMAIL_RATE_LIMIT`: Maximum emails in the rate limiting window

### API Endpoints

#### Send Welcome Email
```
POST /api/email/send-welcome
```
*Requires API key and Firebase authentication*

Request body:
```json
{
  "email": "user@example.com",
  "username": "Username"
}
```

#### Send Login Notification
```
POST /api/email/send-login-notification
```
*Requires API key and Firebase authentication*

Request body:
```json
{
  "email": "user@example.com",
  "username": "Username",
  "loginTime": "May 18, 2025, 15:30:00"
}
```

### Templates

Email templates are stored in two formats:
- MJML source files in `src/templates/mjml/`
- Compiled HTML templates in `src/templates/html/`

To modify templates, edit the MJML files and compile them to HTML using the MJML CLI or online tools.

## License

ISC

---

For any issues or feature requests, please contact the development team.