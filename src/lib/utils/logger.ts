import 'server-only';

/**
 * Simple structured logger for server-side operations
 *
 * This logger provides consistent formatting and log levels for server operations.
 * It can be extended to integrate with external logging services (e.g., DataDog, Logtail)
 * or replaced with a full logging library (e.g., winston, pino) as needs grow.
 *
 * IMPORTANT: Never log sensitive information like credentials, tokens, or PII.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Module or feature area */
  module: string;
  /** Optional operation or action being performed */
  operation?: string;
  /** Optional user ID (never log full user data) */
  userId?: string;
  /** Additional structured data */
  data?: Record<string, unknown>;
}

/**
 * Formats a log message with timestamp and context
 */
const formatLogMessage = (level: LogLevel, context: LogContext, message: string): string => {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context.module}]`;
  const operation = context.operation ? ` [${context.operation}]` : '';
  return `${prefix}${operation} ${message}`;
};

/**
 * Safely serializes data for logging, filtering sensitive fields
 */
const safeSerialize = (data: Record<string, unknown>): Record<string, unknown> => {
  const sensitiveKeys = [
    'password',
    'secret',
    'token',
    'key',
    'credential',
    'authorization',
    'cookie',
    'session',
    'accesskey',
    'secretkey',
    'apikey',
    'private',
  ];

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(
      (sensitive) => lowerKey.includes(sensitive) || lowerKey === sensitive
    );

    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (Array.isArray(value)) {
      // Recursively process array elements
      result[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return safeSerialize(item as Record<string, unknown>);
        } else if (Array.isArray(item)) {
          // Handle nested arrays recursively
          return item.map((nestedItem) => {
            if (
              typeof nestedItem === 'object' &&
              nestedItem !== null &&
              !Array.isArray(nestedItem)
            ) {
              return safeSerialize(nestedItem as Record<string, unknown>);
            }
            return nestedItem;
          });
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      result[key] = safeSerialize(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
};

/**
 * Logger class providing structured logging with consistent formatting
 */
class Logger {
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  /**
   * Log a debug message (only in development)
   * Uses console.info with [DEBUG] prefix since console.debug may be disabled
   */
  debug(message: string, data?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'development') {
      const context: LogContext = { module: this.module, data };
      const formatted = formatLogMessage('debug', context, message);
      console.info(formatted, data ? safeSerialize(data) : '');
    }
  }

  /**
   * Log an informational message
   */
  info(message: string, data?: Record<string, unknown>): void {
    const context: LogContext = { module: this.module, data };
    const formatted = formatLogMessage('info', context, message);
    console.info(formatted, data ? safeSerialize(data) : '');
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    const context: LogContext = { module: this.module, data };
    const formatted = formatLogMessage('warn', context, message);
    console.warn(formatted, data ? safeSerialize(data) : '');
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const context: LogContext = { module: this.module, data };
    const formatted = formatLogMessage('error', context, message);

    if (error instanceof Error) {
      console.error(formatted, {
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        ...safeSerialize(data ?? {}),
      });
    } else {
      console.error(formatted, {
        error: String(error),
        ...safeSerialize(data ?? {}),
      });
    }
  }

  /**
   * Log an operation start
   */
  operationStart(operation: string, data?: Record<string, unknown>): void {
    this.info(`Starting: ${operation}`, data);
  }

  /**
   * Log an operation completion
   */
  operationComplete(operation: string, data?: Record<string, unknown>): void {
    this.info(`Completed: ${operation}`, data);
  }

  /**
   * Log an operation failure
   */
  operationFailed(operation: string, error: Error | unknown, data?: Record<string, unknown>): void {
    this.error(`Failed: ${operation}`, error, data);
  }
}

/**
 * Create a logger instance for a specific module
 *
 * @example
 * const logger = createLogger('PRESIGNED_URLS');
 * logger.info('Generating upload URLs', { count: 3 });
 * logger.error('Failed to generate URL', error, { fileId: '123' });
 */
export const createLogger = (module: string): Logger => {
  return new Logger(module);
};

/**
 * Pre-configured loggers for common modules
 */
export const loggers = {
  presignedUrls: createLogger('PRESIGNED_URLS'),
  auth: createLogger('AUTH'),
  database: createLogger('DATABASE'),
  s3: createLogger('S3'),
  notifications: createLogger('NOTIFICATIONS'),
};
