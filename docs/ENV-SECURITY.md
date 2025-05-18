# Environment Variables & Security Guide

## Overview

This guide explains how to properly handle sensitive information such as API keys, credentials, and service account files in the DuckBuck Backend application.

## Environment Variables

All configuration settings and sensitive information should be stored as environment variables in a `.env` file, which is not committed to the repository.

### Setting Up Environment Variables

1. Copy the `.env.example` file to create your own `.env` file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file and fill in your actual values:
   ```bash
   nano .env
   ```

### JSON Credentials in Environment Variables

For security, we store JSON credential files (like Firebase service account keys) directly in the `.env` file rather than as separate files.

#### Adding JSON Files to Environment Variables

Use the provided script to add JSON files to your `.env`:

```bash
node scripts/add-json-to-env.js ./path/to/credentials.json ENV_VARIABLE_NAME
```

Example:
```bash
node scripts/add-json-to-env.js ./ServiceAccountKey.json FIREBASE_SERVICE_ACCOUNT_JSON
```

After adding the JSON to your `.env` file, you can safely delete the original JSON file.

## Firebase Authentication

The application uses Firebase Authentication. The Firebase service account key is stored in the `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable.

### How It Works

1. The Firebase middleware loads the service account from the environment variable
2. It initializes the Firebase Admin SDK with these credentials
3. All authentication requests are verified using these credentials

## Email Service Configuration

Our email service is configured to use Gmail/Google Workspace. Required settings:

1. `EMAIL_AUTH_ADDRESS`: Your primary Google Workspace email used for authentication
2. `GMAIL_EMAIL`: Your alias email address that will appear in the "From" field
3. `GMAIL_APP_PASSWORD`: An app-specific password generated from your Google account

### Creating a Google App Password

1. Go to your Google Account settings
2. Navigate to Security > 2-Step Verification
3. At the bottom, click on "App passwords"
4. Generate a new app password for "Mail" and "Other (Custom name)"
5. Use the generated password as your `GMAIL_APP_PASSWORD` value

## Production Deployment

When deploying to production:

1. Set `NODE_ENV=production` in your environment
2. Never commit the `.env` file or any credential files to version control
3. Use a secure method to pass environment variables to your production environment (e.g., Docker secrets, Kubernetes secrets, etc.)
4. Regularly rotate sensitive credentials and update the environment variables

## Security Best Practices

- Never hard-code secrets in your application code
- Don't store sensitive files in version control
- Use environment variables for all configuration that varies between environments
- Implement proper access controls for your production environment
- Regularly audit and rotate credentials
