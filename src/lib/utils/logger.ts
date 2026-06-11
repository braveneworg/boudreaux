/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import winston from 'winston';

import { getRequestId } from './request-context';

/**
 * Structured Winston logger for server-side operations.
 *
 * Output modes:
 * - production: single-line JSON to stdout (collected by Docker → Alloy → Loki)
 * - development with SHOW_DEV_LOGS=true: colorized, keyed, human-readable lines
 * - development otherwise: quiet (warn and above only)
 *
 * Level resolution: LOG_LEVEL env override → 'info' in production →
 * 'debug'/'warn' in development depending on SHOW_DEV_LOGS.
 * LOG_DEBUG_MODULES=MODULE_A,MODULE_B enables debug for specific modules
 * regardless of the global level.
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
 * List of sensitive field names to redact from logs
 */
const SENSITIVE_KEYS = [
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

/**
 * Safely serializes data for logging, filtering sensitive fields
 */
const safeSerialize = (data: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some(
      (sensitive) => lowerKey.includes(sensitive) || lowerKey === sensitive
    );

    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (Array.isArray(value)) {
      // Recursively sanitize arrays containing objects
      result[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return safeSerialize(item as Record<string, unknown>);
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

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const showDevLogs = process.env.SHOW_DEV_LOGS === 'true';

const isLogLevel = (value: string | undefined): value is LogLevel =>
  value === 'debug' || value === 'info' || value === 'warn' || value === 'error';

const resolveRootLevel = (): LogLevel => {
  if (isLogLevel(process.env.LOG_LEVEL)) {
    return process.env.LOG_LEVEL;
  }
  if (isProduction) {
    return 'info';
  }
  return showDevLogs ? 'debug' : 'warn';
};

const parseDebugModules = (): Set<string> => {
  const raw = process.env.LOG_DEBUG_MODULES ?? '';
  return new Set(
    raw
      .split(',')
      .map((moduleName) => moduleName.trim())
      .filter((moduleName) => moduleName.length > 0)
  );
};

const rootLevel = resolveRootLevel();
const debugModules = parseDebugModules();

const computeModuleLevel = (module: string): LogLevel =>
  debugModules.has(module) ? 'debug' : rootLevel;

/** Security audit events must keep flowing even when verbosity is dialed down */
const AUDIT_MODULE = 'AUDIT';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const clampLevelForModule = (module: string, level: LogLevel): LogLevel =>
  module === AUDIT_MODULE && LEVEL_WEIGHT[level] > LEVEL_WEIGHT.info ? 'info' : level;

export interface LogLevelState {
  /** Level resolved from env at process start */
  configuredLevel: LogLevel;
  /** Active runtime override, or null when running on the configured default */
  override: LogLevel | null;
  /** The level requests are currently logged at */
  effectiveLevel: LogLevel;
  /** ISO timestamp when the override auto-reverts, or null (no TTL / no override) */
  expiresAt: string | null;
}

interface RuntimeLogState {
  registry: Map<string, winston.Logger>;
  override: LogLevel | null;
  expiresAt: number | null;
  timer: NodeJS.Timeout | null;
}

// Stored on globalThis (same pattern as src/lib/prisma.ts) so the override
// applies process-wide even if the bundler duplicates this module across
// server-action and route-handler chunks.
const globalForLogger = globalThis as unknown as { boudreauxLogState?: RuntimeLogState };

const runtimeState: RuntimeLogState = (globalForLogger.boudreauxLogState ??= {
  registry: new Map<string, winston.Logger>(),
  override: null,
  expiresAt: null,
  timer: null,
});

/**
 * Human-readable colorized output for local development (SHOW_DEV_LOGS=true)
 */
const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.printf((info) => {
    const { level, message, timestamp, module, operation, service, ...meta } = info;
    void service;
    const operationPart = operation ? ` [${String(operation)}]` : '';
    const metaPart = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${String(timestamp)} ${level} [${String(module)}]${operationPart} ${String(message)}${metaPart}`;
  })
);

/**
 * Single-line JSON for production stdout (Docker → Alloy → Loki)
 */
const productionFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

const createWinstonLogger = (module: string): winston.Logger => {
  const existing = runtimeState.registry.get(module);
  if (existing) {
    return existing;
  }

  const moduleLogger = winston.createLogger({
    level: clampLevelForModule(module, runtimeState.override ?? computeModuleLevel(module)),
    // Keep unit-test output clean; specs assert on a mocked logger module
    silent: isTest && !isLogLevel(process.env.LOG_LEVEL),
    format: isProduction ? productionFormat : developmentFormat,
    defaultMeta: { service: 'boudreaux', module },
    transports: [new winston.transports.Console()],
  });

  runtimeState.registry.set(module, moduleLogger);
  return moduleLogger;
};

/**
 * Override the log level of every module logger at runtime (admin tooling).
 * Pass `null` to clear the override and restore env-configured defaults.
 * When `ttlMs` is provided with a level, the override auto-reverts after it
 * elapses. The AUDIT module never goes coarser than `info`.
 */
export const setRuntimeLogLevel = (level: LogLevel | null, ttlMs?: number): LogLevelState => {
  if (runtimeState.timer) {
    clearTimeout(runtimeState.timer);
    runtimeState.timer = null;
  }

  runtimeState.override = level;
  runtimeState.expiresAt = null;

  for (const [module, moduleLogger] of runtimeState.registry) {
    moduleLogger.level = clampLevelForModule(module, level ?? computeModuleLevel(module));
  }

  if (level !== null && ttlMs !== undefined && ttlMs > 0) {
    runtimeState.expiresAt = Date.now() + ttlMs;
    const timer = setTimeout(() => {
      setRuntimeLogLevel(null);
    }, ttlMs);
    // Never keep the process alive just for the revert timer
    timer.unref?.();
    runtimeState.timer = timer;
  }

  return getLogLevelState();
};

/**
 * Current level configuration: env-configured default, active runtime
 * override, and the override's expiry (if any).
 */
export const getLogLevelState = (): LogLevelState => ({
  configuredLevel: rootLevel,
  override: runtimeState.override,
  effectiveLevel: runtimeState.override ?? rootLevel,
  expiresAt:
    runtimeState.expiresAt !== null ? new Date(runtimeState.expiresAt).toISOString() : null,
});

/**
 * Merge the active request id (when inside a request scope) into log meta
 * so every line of a request can be correlated with one LogQL query.
 */
const withRequestId = (
  meta: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  const requestId = getRequestId();
  if (requestId === undefined) {
    return meta;
  }
  return { requestId, ...meta };
};

/**
 * Logger class providing structured logging with consistent formatting
 */
class Logger {
  private readonly module: string;
  private readonly winston: winston.Logger;

  constructor(module: string) {
    this.module = module;
    this.winston = createWinstonLogger(module);
  }

  /**
   * Log a debug message (global debug level or LOG_DEBUG_MODULES opt-in)
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.winston.debug(message, withRequestId(data ? safeSerialize(data) : undefined));
  }

  /**
   * Log an informational message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.winston.info(message, withRequestId(data ? safeSerialize(data) : undefined));
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.winston.warn(message, withRequestId(data ? safeSerialize(data) : undefined));
  }

  /**
   * Log an error message; includes the stack trace as structured data
   */
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const meta: Record<string, unknown> = withRequestId(safeSerialize(data ?? {})) ?? {};

    if (error instanceof Error) {
      meta.error = error.message;
      meta.stack = error.stack;
    } else if (error !== undefined) {
      meta.error = String(error);
    }

    this.winston.error(message, meta);
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

const sampleCounters = new Map<string, number>();

/**
 * Volume control for high-frequency log sites: returns true for the first
 * occurrence of `key`, then once every `oneInN` calls.
 *
 * @example
 * if (shouldSample('download.confirm.success', 10)) {
 *   loggers.downloads.info('Download confirmed', { releaseId });
 * }
 */
export const shouldSample = (key: string, oneInN: number): boolean => {
  if (oneInN <= 1) {
    return true;
  }

  const count = (sampleCounters.get(key) ?? 0) + 1;
  sampleCounters.set(key, count);
  return count === 1 || count % oneInN === 0;
};

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
  media: createLogger('MEDIA'),
  s3: createLogger('S3'),
  notifications: createLogger('NOTIFICATIONS'),
  chat: createLogger('CHAT'),
  stripe: createLogger('STRIPE'),
  downloads: createLogger('DOWNLOADS'),
  payments: createLogger('PAYMENTS'),
  audit: createLogger('AUDIT'),
  http: createLogger('HTTP'),
};
