const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { DATABASE_CONFIG } = require('./constants');

/**
 * MongoDB connection options with updated configuration for current Mongoose version
 */
const mongoOptions = {
  // Remove deprecated options: useNewUrlParser, useUnifiedTopology, keepAlive, keepAliveInitialDelay
  maxPoolSize: DATABASE_CONFIG.CONNECTION_POOL_SIZE,
  serverSelectionTimeoutMS: 5000, // Server selection timeout
  socketTimeoutMS: 45000,  
  family: 4,  
  autoIndex: process.env.NODE_ENV, 
  dbName: DATABASE_CONFIG.DB_NAME 
};

/**
 * Establishes a connection to MongoDB using the URI from environment variables
 * with automatic reconnection logic
 */
const connectDB = async () => {
  try {
    // Create connection
    const conn = await mongoose.connect(process.env.MONGODB_URI, mongoOptions);

    // Connection success handler
    mongoose.connection.on('connected', () => {
      logger.info(`MongoDB Connected to database: ${DATABASE_CONFIG.DB_NAME} at host: ${conn.connection.host}`);
    });

    // Connection error handler
    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err}`);
    });

    // Connection disconnected handler
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    // Node process termination or interruption handler
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed through app termination');
        process.exit(0);
      } catch (err) {
        logger.error('Error during MongoDB connection closure:', err);
        process.exit(1);
      }
    });

    return conn;
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    
    // Instead of exiting immediately, retry connection after delay
    if (process.env.NODE_ENV === 'production') {
      logger.info('Retrying MongoDB connection in 5 seconds...');
      setTimeout(connectDB, 5000);
    } else {
      process.exit(1);
    }
  }
};

module.exports = connectDB;