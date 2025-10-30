import winston from 'winston';
import type { Logger } from '../types';

interface LoggerOptions {
  level?: string;
}

/**
 * Create a Winston logger instance
 */
export function createLogger(options?: LoggerOptions): Logger {
  const logLevel = options?.level || process.env.LOG_LEVEL || 'info';

  const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json()
    ),
    defaultMeta: { service: 'discord-translator' },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            let msg = `${timestamp} [${level}]: ${message}`;
            if (Object.keys(meta).length > 0 && meta.service !== 'discord-translator') {
              msg += ` ${JSON.stringify(meta)}`;
            }
            return msg;
          })
        ),
      }),
    ],
  });

  return {
    error(message: string, meta?: unknown): void {
      logger.error(message, meta);
    },
    warn(message: string, meta?: unknown): void {
      logger.warn(message, meta);
    },
    info(message: string, meta?: unknown): void {
      logger.info(message, meta);
    },
    debug(message: string, meta?: unknown): void {
      logger.debug(message, meta);
    },
  };
}

// Export a default logger instance
export const logger = createLogger();
