import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    env: env.NODE_ENV,
  },
  redact: {
    paths: ['req.headers.authorization', 'password', 'apiKey', 'token'],
    censor: '[REDACTED]',
  },
});

export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}
