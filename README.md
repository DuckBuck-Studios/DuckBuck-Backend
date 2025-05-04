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

Create a `.env` file in the root directory with the following variables:

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
MONGODB_URI=mongodb://localhost:27017/duckbuck

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
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

## License

ISC

---

For any issues or feature requests, please contact the development team.