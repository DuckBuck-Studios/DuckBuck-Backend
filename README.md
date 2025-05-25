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
- Request validation
- Logging with Winston
- Request timeout handling
- Health check endpoint
- Transactional email service (Welcome, Login Notification, Account Deletion)

## Prerequisites

- Node.js >= 18.0.0
- MongoDB
- Firebase Admin SDK credentials
- Agora App ID and certificate
- Gmail/Google Workspace account for sending emails (App Password required)

## Environment Variables

Create a `.env` file in the root directory. Key variables include:

```env
# Server
PORT=8080
NODE_ENV=production # or development
TRUST_PROXY=true # Set to true if behind a proxy/load balancer
REQUEST_TIMEOUT_MS=30000

# API Key (generate a secure random string)
API_KEY=your_secure_api_key

# API Rate Limiting
API_RATE_WINDOW_MS=900000  # 15 minutes in milliseconds
API_RATE_LIMIT=100         # Max requests per window per IP

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name
MONGO_DB_NAME=your_database_name

# Firebase
# Ensure FIREBASE_SERVICE_ACCOUNT_JSON is a valid JSON string or a base64 encoded JSON string for production.
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"your-project-id",...}

# Email Configuration
EMAIL_AUTH_ADDRESS=your_primary_google_account_email@gmail.com # e.g., admin@example.com
GMAIL_EMAIL=your_sending_email_address@yourdomain.com          # e.g., no-reply@example.com (can be an alias)
GMAIL_APP_PASSWORD=your_google_app_password                    # 16-character app password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true                                            # Use true for SSL (port 465)
# Optional: Email rate limiting (per recipient)
# EMAIL_RATE_WINDOW_MS=86400000 # 24 hours
# EMAIL_RATE_LIMIT=5            # Max 5 emails per recipient per window

# Agora
AGORA_APP_ID=your-agora-app-id
AGORA_APP_CERTIFICATE=your-agora-app-certificate

# Security (Content Security Policy)
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

## Running the Server

```bash
npm start
```
This will start the backend server. By default, it runs on the port specified in your `.env` file (e.g., 8080).

## API Endpoints

All API endpoints require an `X-API-Key` header with the value of your `API_KEY` from the `.env` file.
Endpoints under `/api/users/` also require Firebase authentication (Bearer token).

### Health Check
- **`GET /health`**
  - Description: Get server health status, including uptime, memory usage, and database connectivity.
  - Request Body: None
  - Response: JSON object with health status.

### Waitlist Registration
- **`POST /api/waitlist`**
  - Description: Register a new user for the waitlist.
  - Request Body:
    ```json
    {
      "email": "user@example.com"
    }
    ```
  - Response: Success or error message.

### Contact/Message
- **`POST /api/contact`**
  - Description: Submit a contact form message.
  - Request Body:
    ```json
    {
      "name": "John Doe",
      "email": "john.doe@example.com",
      "message": "Hello, I have a question."
    }
    ```
  - Response: Success or error message.

### User Management & Email Notifications
*(These endpoints require Firebase Authentication - include a Bearer token in the Authorization header)*

- **`POST /api/users/send-welcome-email`**
  - Description: Sends a welcome email to the specified user.
  - Request Body:
    ```json
    {
      "email": "user@example.com",
      "username": "NewUser123"
    }
    ```
  - Response: Success or error message.

- **`POST /api/users/send-login-notification`**
  - Description: Sends a login notification email.
  - Request Body:
    ```json
    {
      "email": "user@example.com",
      "username": "User123",
      "loginTime": "May 25, 2025, 10:00:00 AM" // Optional, otherwise current time is used
    }
    ```
  - Response: Success or error message.

- **`DELETE /api/users/delete`**
  - Description: Deletes a user account from Firebase Authentication, Firestore, and Storage. Sends a deletion confirmation email.
  - Request Body:
    ```json
    {
      "uid": "firebase_user_uid_to_delete"
    }
    ```
  - Response: Success or error message.

### HTML Templates
Email templates are sourced from MJML files in `src/templates/mjml/` and compiled to HTML in `src/templates/html/`.
If you modify the `.mjml` files, you need to recompile them to HTML using the MJML CLI:
```bash
# Example: npm install -g mjml
mjml -r src/templates/mjml/welcome.mjml -o src/templates/html/welcome.html
```

## License

ISC