/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Environment variable validation
 * Run this early in the application lifecycle to catch configuration errors
 */

/**
 * Throw if any of the listed env vars is missing (absent or empty). Uses a Set
 * of present keys so dynamic env names stay off plain-object access.
 */
const assertRequiredPresent = (required: string[]): void => {
  const presentEnvKeys = new Set(
    Object.entries(process.env)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key)
  );
  const missing = required.filter((key) => !presentEnvKeys.has(key));

  if (missing.length > 0) {
    throw Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please check your environment configuration and ensure all required variables are set.'
    );
  }
};

/** Throw if AUTH_SECRET is set but too short to be secure. */
const assertAuthSecretStrength = (): void => {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length < 32) {
    throw Error('AUTH_SECRET must be at least 32 characters for security');
  }
};

/** Warn if DATABASE_URL is set but does not look like a MongoDB connection string. */
const warnOnNonMongoDatabaseUrl = (): void => {
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('mongodb')) {
    console.warn('Warning: DATABASE_URL does not appear to be a MongoDB connection string');
  }
};

export const validateEnvironment = () => {
  // Skip validation during build phase (secrets not available in Docker build)
  // or when explicitly disabled (e.g. E2E test runs that inject stub env vars).
  if (process.env.SKIP_ENV_VALIDATION === 'true') {
    const reason =
      process.env.NEXT_PHASE === 'phase-production-build' ? 'build phase' : 'SKIP_ENV_VALIDATION';
    console.warn(`⚠️  Environment validation skipped (${reason})`);
    return;
  }

  const required = [
    'DATABASE_URL',
    'AUTH_SECRET',
    'CLOUDFLARE_SECRET',
    'EMAIL_FROM',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'AWS_S3_BUCKET_NAME',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'PUSHER_APP_ID',
    'PUSHER_KEY',
    'PUSHER_SECRET',
    'PUSHER_CLUSTER',
    'NEXT_PUBLIC_PUSHER_KEY',
    'NEXT_PUBLIC_PUSHER_CLUSTER',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    // Name of the deployed bio-generator Lambda the app invokes for AI bios.
    'BIO_GENERATOR_LAMBDA_NAME',
  ];

  assertRequiredPresent(required);

  // Validate AUTH_SECRET length
  assertAuthSecretStrength();

  // Validate DATABASE_URL format (basic check)
  warnOnNonMongoDatabaseUrl();

  console.info('✅ Environment validation passed');
};

// For production builds
if (process.env.NODE_ENV === 'production') {
  validateEnvironment();
}
