/**
 * Environment variable validation
 * Run this early in the application lifecycle to catch configuration errors
 */

export function validateEnvironment() {
  const required = [
    'DATABASE_URL',
    'AUTH_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'EMAIL_SERVER_HOST',
    'EMAIL_SERVER_USER',
    'EMAIL_SERVER_PASSWORD',
    'EMAIL_FROM',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please check your .env.local file and ensure all required variables are set.'
    );
  }

  // Validate AUTH_SECRET length
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length < 32) {
    throw new Error('AUTH_SECRET must be at least 32 characters for security');
  }

  // Validate DATABASE_URL format (basic check)
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('mongodb')) {
    console.warn('Warning: DATABASE_URL does not appear to be a MongoDB connection string');
  }

  // Validate email configuration
  if (process.env.EMAIL_SERVER_PORT) {
    const port = Number(process.env.EMAIL_SERVER_PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error('EMAIL_SERVER_PORT must be a valid port number (1-65535)');
    }
  }

  console.log('✅ Environment validation passed');
}

// For production builds
if (process.env.NODE_ENV === 'production') {
  validateEnvironment();
}
