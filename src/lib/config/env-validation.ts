/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Environment variable validation
 * Run this early in the application lifecycle to catch configuration errors
 */

export function validateEnvironment() {
  // Skip validation during Docker build (secrets not available yet)
  if (process.env.SKIP_ENV_VALIDATION === 'true') {
    console.warn('⚠️  Environment validation skipped (SKIP_ENV_VALIDATION=true)');
    console.warn('   Variables will be validated at runtime when container starts');
    return;
  }

  const required = [
    'DATABASE_URL',
    'AUTH_SECRET',
    // 'GOOGLE_CLIENT_ID',
    // 'GOOGLE_CLIENT_SECRET',
    'EMAIL_SERVER_HOST',
    'EMAIL_SERVER_USER',
    'EMAIL_SERVER_PASSWORD',
    'EMAIL_FROM',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please check your environment configuration and ensure all required variables are set.'
    );
  }

  // Validate AUTH_SECRET length
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length < 32) {
    throw Error('AUTH_SECRET must be at least 32 characters for security');
  }

  // Validate DATABASE_URL format (basic check)
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('mongodb')) {
    console.warn('Warning: DATABASE_URL does not appear to be a MongoDB connection string');
  }

  // Validate email configuration
  if (process.env.EMAIL_SERVER_PORT) {
    const port = Number(process.env.EMAIL_SERVER_PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw Error('EMAIL_SERVER_PORT must be a valid port number (1-65535)');
    }
  }

  console.info('✅ Environment validation passed');
}

// For production builds
if (process.env.NODE_ENV === 'production') {
  validateEnvironment();
}
