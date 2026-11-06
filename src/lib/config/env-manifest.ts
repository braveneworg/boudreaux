/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The runtime configuration manifest: every environment variable `src/` reads,
 * where production gets it from, and whether the app can run without it.
 *
 * A name is spelled in four places — a GitHub secret, the `.env.deploy`
 * heredoc in `roll-host.yml`, the website `environment:` block in
 * `docker-compose.prod.yml`, and the code that reads it. Nothing used to
 * connect them, so a dropped name reached the code as `undefined` and the
 * feature behind it switched itself off without a word. This manifest is the
 * one list the others are checked against (`scripts/ci/runtime-config-drift.spec.ts`),
 * the boot check is derived from it (`boot-check.ts`), and the typed getters
 * read through it (`runtime-config.ts`). See ADR-0024.
 *
 * Pure data: no `process.env` reads and no server-only imports, so specs and
 * scripts can load it anywhere.
 */

/**
 * Where production gets a value.
 *
 * - `runtime` — written to the host's env file by `roll-host.yml` and passed
 *   into the website container by `docker-compose.prod.yml`; read when the
 *   code runs.
 * - `build` — a `NEXT_PUBLIC_*` value Next.js inlines into the bundles at
 *   `next build`, so it must reach the CI build, the Dockerfile and the
 *   deploy workflow's build args. Its value in the running container does
 *   not matter.
 * - `local` — never set in production: platform values (`NODE_ENV`), dev,
 *   test and E2E switches, and knobs production does not forward today.
 *   Never written to the deploy env file.
 */
export type EnvPhase = 'runtime' | 'build' | 'local';

/**
 * Whether the app can run without the value.
 *
 * - `required` — production refuses to boot without it (runtime) or the
 *   build must set it (build).
 * - `optional` — the code has a fallback, or the value belongs to a
 *   **feature group** that switches off when it is empty.
 */
export type EnvRequirement = 'required' | 'optional';

export interface EnvVarSpec {
  name: string;
  phase: EnvPhase;
  requirement: EnvRequirement;
  /** What the value is for, and what happens without it. */
  description: string;
}

export type FeatureGroupId =
  | 'google'
  | 'facebook'
  | 'twitter'
  | 'apple'
  | 'cloudfrontSignedUrls'
  | 'cloudfrontInvalidation'
  | 'stripeWebhookIpAllowlist';

/**
 * A feature group: optional values that only work together. The feature is
 * on when every name in `requires` is set and, when `oneOf` is given, every
 * name of at least one of its alternatives is set too. With none of its
 * names set the feature is off, which is a choice. With some set but not
 * enough, the feature is off by mistake: the boot check logs it as an error.
 */
export interface FeatureGroupSpec {
  id: FeatureGroupId;
  /** What switches off while the group is incomplete. */
  feature: string;
  requires: readonly string[];
  oneOf?: readonly (readonly string[])[];
}

export const FEATURE_GROUPS: readonly FeatureGroupSpec[] = [
  {
    id: 'google',
    feature: 'Sign in with Google',
    requires: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  },
  {
    id: 'facebook',
    feature: 'Sign in with Facebook',
    requires: ['FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET'],
  },
  {
    id: 'twitter',
    feature: 'Sign in with X (Twitter)',
    requires: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'],
  },
  {
    id: 'apple',
    feature: 'Sign in with Apple',
    requires: ['APPLE_CLIENT_ID'],
    // A secret minted at boot from the .p8 key material, or a static one.
    oneOf: [['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY_BASE64'], ['APPLE_CLIENT_SECRET']],
  },
  {
    id: 'cloudfrontSignedUrls',
    feature: 'CloudFront signed download and stream URLs (S3 presigned URLs are used instead)',
    requires: ['CLOUDFRONT_KEY_PAIR_ID', 'CLOUDFRONT_PRIVATE_KEY_BASE64'],
  },
  {
    id: 'cloudfrontInvalidation',
    feature: 'CloudFront cache invalidation after cover-art and media changes',
    requires: ['CLOUDFRONT_DISTRIBUTION_ID'],
  },
  {
    id: 'stripeWebhookIpAllowlist',
    feature: 'Stripe webhook source-IP allowlist (signature verification still applies)',
    requires: ['STRIPE_WEBHOOK_IP_RANGES'],
  },
];

const runtime = (name: string, requirement: EnvRequirement, description: string): EnvVarSpec => ({
  name,
  phase: 'runtime',
  requirement,
  description,
});

const build = (name: string, description: string): EnvVarSpec => ({
  name,
  phase: 'build',
  requirement: 'required',
  description,
});

const local = (name: string, description: string): EnvVarSpec => ({
  name,
  phase: 'local',
  requirement: 'optional',
  description,
});

export const ENV_MANIFEST: readonly EnvVarSpec[] = [
  // ── Core runtime: production refuses to boot without these ──────────────
  runtime('DATABASE_URL', 'required', 'MongoDB connection string.'),
  runtime('AUTH_SECRET', 'required', 'better-auth signing secret, at least 32 characters.'),
  runtime(
    'AUTH_URL',
    'required',
    'Canonical public origin: better-auth base URL and Stripe return URLs.'
  ),
  runtime('CLOUDFLARE_SECRET', 'required', 'Turnstile server-side verification secret.'),
  runtime('EMAIL_FROM', 'required', 'Sender address for every SES email.'),
  runtime('AWS_ACCESS_KEY_ID', 'required', 'AWS credentials for S3, SES, SNS, Lambda.'),
  runtime('AWS_SECRET_ACCESS_KEY', 'required', 'AWS credentials for S3, SES, SNS, Lambda.'),
  runtime('AWS_REGION', 'required', 'AWS region of the bucket and services.'),
  runtime('AWS_S3_BUCKET_NAME', 'required', 'Media bucket for uploads, deletes and downloads.'),
  runtime('STRIPE_SECRET_KEY', 'required', 'Stripe API key.'),
  runtime('STRIPE_WEBHOOK_SECRET', 'required', 'Stripe webhook signature secret.'),
  runtime('PUSHER_APP_ID', 'required', 'Pusher server credentials (live chat).'),
  runtime('PUSHER_KEY', 'required', 'Pusher server credentials (live chat).'),
  runtime('PUSHER_SECRET', 'required', 'Pusher server credentials (live chat).'),
  runtime('PUSHER_CLUSTER', 'required', 'Pusher server credentials (live chat).'),
  runtime('UPSTASH_REDIS_REST_URL', 'required', 'Upstash Redis (rate limits, throttles).'),
  runtime('UPSTASH_REDIS_REST_TOKEN', 'required', 'Upstash Redis (rate limits, throttles).'),
  runtime('BIO_GENERATOR_LAMBDA_NAME', 'required', 'Bio-generator Lambda function name.'),
  runtime('JOB_CALLBACK_SECRET', 'required', 'Root of per-job callback signing keys (ADR-0014).'),

  // ── Feature groups (see FEATURE_GROUPS) ─────────────────────────────────
  runtime('GOOGLE_CLIENT_ID', 'optional', 'Google OAuth client.'),
  runtime('GOOGLE_CLIENT_SECRET', 'optional', 'Google OAuth client.'),
  runtime('FACEBOOK_CLIENT_ID', 'optional', 'Facebook OAuth client.'),
  runtime('FACEBOOK_CLIENT_SECRET', 'optional', 'Facebook OAuth client.'),
  runtime('TWITTER_CLIENT_ID', 'optional', 'X (Twitter) OAuth client.'),
  runtime('TWITTER_CLIENT_SECRET', 'optional', 'X (Twitter) OAuth client.'),
  runtime('APPLE_CLIENT_ID', 'optional', 'Apple Services ID.'),
  runtime('APPLE_CLIENT_SECRET', 'optional', 'Static Apple client secret (fallback).'),
  runtime('APPLE_TEAM_ID', 'optional', 'Apple .p8 key material: team.'),
  runtime('APPLE_KEY_ID', 'optional', 'Apple .p8 key material: key id.'),
  runtime('APPLE_PRIVATE_KEY_BASE64', 'optional', 'Apple .p8 key material: base64 PEM.'),
  runtime('APPLE_APP_BUNDLE_IDENTIFIER', 'optional', 'Apple native-app bundle id.'),
  runtime('CLOUDFRONT_KEY_PAIR_ID', 'optional', 'CloudFront URL signing key pair.'),
  runtime('CLOUDFRONT_PRIVATE_KEY_BASE64', 'optional', 'CloudFront URL signing private key.'),
  runtime('CLOUDFRONT_DISTRIBUTION_ID', 'optional', 'CloudFront distribution to invalidate.'),
  runtime('STRIPE_WEBHOOK_IP_RANGES', 'optional', 'Comma-separated Stripe webhook CIDRs.'),

  // ── Optional runtime values with fallbacks ──────────────────────────────
  runtime('CDN_DOMAIN', 'optional', 'Media CDN host for server-side URL building.'),
  runtime(
    'NEXT_PUBLIC_HOST_NAME',
    'optional',
    'Public origin for share links. Not in the build env, so client reads use their fallback.'
  ),
  runtime(
    'NEXT_PUBLIC_BASE_URL',
    'optional',
    'Public origin for emails and server links. Not in the build env, so client reads use their fallback.'
  ),
  runtime('LOG_LEVEL', 'optional', 'Root winston level; defaults to info in production.'),
  runtime('SMS_PROVIDER', 'optional', "SMS transport: 'sns' or 'noop' (default)."),
  runtime('SNS_SMS_ORIGINATION_NUMBER', 'optional', 'SNS origination number.'),

  // ── Build time: inlined into the bundles by `next build` ────────────────
  build('NEXT_PUBLIC_CLOUDFLARE_SITE_KEY', 'Turnstile widget site key.'),
  build('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'Stripe.js publishable key.'),
  build('NEXT_PUBLIC_CDN_DOMAIN', 'Media CDN host for client URL building.'),
  build('NEXT_PUBLIC_PUSHER_KEY', 'Pusher client key.'),
  build('NEXT_PUBLIC_PUSHER_CLUSTER', 'Pusher client cluster.'),

  // ── Local: never set in production ──────────────────────────────────────
  local('NODE_ENV', 'Set by Next.js and the Dockerfile.'),
  local('NEXT_RUNTIME', 'Set by Next.js: nodejs or edge.'),
  local('NEXT_PHASE', 'Set by Next.js during the build.'),
  local('SKIP_ENV_VALIDATION', 'Skips the boot check: Docker build and E2E servers.'),
  local('E2E_MODE', 'E2E server switch; refused in production by auth.ts.'),
  local('NEXT_PUBLIC_E2E_MODE', 'E2E build switch.'),
  local('BIO_GENERATOR_FAKE', 'Deterministic bio-generation fixture for E2E.'),
  local('BIO_GENERATOR_FAKE_DELAY_MS', 'Delay of the bio-generation fixture.'),
  local('SKIP_STRIPE_IP_CHECK', 'Bypasses the Stripe webhook IP allowlist locally.'),
  local('SHOW_DEV_LOGS', 'Verbose development logging.'),
  local('NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY', 'Turnstile test site key for E2E.'),
  local('NEXT_PUBLIC_DISABLE_QUERY_CACHE', 'Disables TanStack Query caching (E2E).'),
  local('NEXT_PUBLIC_DISABLE_BANNERS_CACHE', 'Disables the banners query cache (E2E).'),
  local('S3_BUCKET', 'Legacy bucket alias read after AWS_S3_BUCKET_NAME (CI E2E sets it).'),
  local('AUTH_DISABLE_SIGNUP', 'Magic-link signup kill switch. Not forwarded to production.'),
  local('CONTACT_EMAIL', 'Contact-form recipient; falls back to EMAIL_FROM. Not forwarded.'),
  local('LOG_DEBUG_MODULES', 'Per-module debug logging. Not forwarded to production.'),
  local('SLOW_QUERY_MS', 'Slow-query warning threshold. Not forwarded to production.'),
];

/** Every member name of a feature group: `requires` plus every `oneOf` alternative. */
export const featureGroupMembers = (group: FeatureGroupSpec): string[] => [
  ...group.requires,
  ...(group.oneOf ?? []).flat(),
];

/**
 * - `enabled` — complete: the feature works.
 * - `disabled` — none of its names is set: the feature is off by choice.
 * - `half-set` — some names are set but not enough: off by mistake.
 */
export type FeatureGroupState = 'enabled' | 'disabled' | 'half-set';

export interface FeatureGroupStatus {
  id: FeatureGroupId;
  feature: string;
  state: FeatureGroupState;
  /** Names to set for the group to be complete (the shortest alternative); empty when enabled. */
  missing: string[];
}

/**
 * Decide a feature group's state from the names that hold a non-empty value.
 * Takes the set of present names rather than the environment so callers never
 * index `process.env` with a computed key.
 */
export const evaluateFeatureGroup = (
  group: FeatureGroupSpec,
  present: ReadonlySet<string>
): FeatureGroupStatus => {
  const unset = (names: readonly string[]): string[] => names.filter((name) => !present.has(name));
  const alternatives = (group.oneOf ?? [[]]).map((alternative) => unset(alternative));
  const shortestAlternative = alternatives.reduce((best, next) =>
    next.length < best.length ? next : best
  );
  const missing = [...unset(group.requires), ...shortestAlternative];
  const anySet = featureGroupMembers(group).some((name) => present.has(name));
  const state: FeatureGroupState =
    missing.length === 0 ? 'enabled' : anySet ? 'half-set' : 'disabled';

  return {
    id: group.id,
    feature: group.feature,
    state,
    missing: state === 'enabled' ? [] : missing,
  };
};

/** The names in `env` that hold a non-empty value. */
export const presentEnvNames = (env: Readonly<Record<string, string | undefined>>): Set<string> =>
  new Set(
    Object.entries(env)
      .filter(([, value]) => value !== undefined && value.trim() !== '')
      .map(([name]) => name)
  );
