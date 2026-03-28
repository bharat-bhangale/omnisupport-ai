import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Connect to MongoDB Atlas
 */
export async function connectDatabase(): Promise<void> {
  try {
    mongoose.set('strictQuery', true);

    await mongoose.connect(env.MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info('MongoDB connected');

    mongoose.connection.on('error', (error) => {
      logger.error({ error }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to connect to MongoDB');
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

/**
 * Check if MongoDB is connected
 */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
