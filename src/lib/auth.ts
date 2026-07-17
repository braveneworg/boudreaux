/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { admin, magicLink } from 'better-auth/plugins';

import { startAppleSecretExpiryMonitor } from '@/lib/auth/apple-secret-expiry-monitor';
import { assertNotBanEvading } from '@/lib/auth/ban-evasion-hook';
import { purchaseSessionPlugin } from '@/lib/auth/purchase-session-plugin';
import {
  accountLinkingConfig,
  buildSocialProvidersConfig,
  resolveAppleClientSecret,
} from '@/lib/auth/social-providers-config';
import { userCreateBeforeHook } from '@/lib/auth/user-create-before-hook';
import { sendMagicLinkEmail } from '@/lib/email/send-magic-link-email';
import { prisma } from '@/lib/prisma';
import { UserRepository } from '@/lib/repositories/user-repository';

import type { BetterAuthOptions } from 'better-auth';

// Magic-link lifetime — adopt better-auth's 5-minute default (the old Auth.js
// flow used 24h). Kept as a named constant so the email copy stays in sync.
const MAGIC_LINK_EXPIRES_IN_SECONDS = 60 * 5;

// Cookie-cache lifetime. Short enough to keep an edge-read `role` reasonably
// fresh for the optimistic middleware gate (authoritative checks stay
// server-side in `withAdmin`), long enough to avoid a DB hit on every request.
const SESSION_COOKIE_CACHE_MAX_AGE_SECONDS = 60 * 5;

// In production we want secure (httpOnly + secure) cookies, except under E2E
// where the standalone server runs over plain HTTP.
const isProductionRuntime =
  process.env.NODE_ENV === 'production' && process.env.E2E_MODE !== 'true';

// Operational kill switch for new signups. When AUTH_DISABLE_SIGNUP === 'true',
// the magic-link verify step refuses unknown emails (`new_user_signup_disabled`)
// instead of auto-creating an account, funneling new users through /signup
// (which enforces the disposable-email check + terms capture). Unset/anything
// else keeps signups open (default = prior behavior). Read at startup —
// toggling takes effect on the next server restart.
const DISABLE_MAGIC_LINK_SIGNUP = process.env.AUTH_DISABLE_SIGNUP === 'true';

// Validate AUTH_SECRET exists and is sufficiently long. Skipped during build
// when SKIP_ENV_VALIDATION is set (mirrors the previous Auth.js guard).
if (process.env.SKIP_ENV_VALIDATION !== 'true') {
  if (!process.env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET environment variable is required');
  }

  if (process.env.AUTH_SECRET.length < 32) {
    throw new Error('AUTH_SECRET must be at least 32 characters long for security');
  }

  // Security: prevent E2E_MODE from degrading cookie security in production.
  if (process.env.E2E_MODE === 'true' && process.env.NODE_ENV === 'production') {
    throw new Error('E2E_MODE must not be enabled in production — it disables cookie security');
  }
}

/**
 * Resolve better-auth's base URL as a dynamic, per-request config so auth works
 * same-origin whether the app is served from the apex or the `www` subdomain
 * (host-only session cookies — no `crossSubDomainCookies` — require auth to stay
 * first-party). better-auth resolves the base URL from the served host (via the
 * proxy's `x-forwarded-host`, trusted by default for dynamic configs) when it
 * matches `allowedHosts`, and trusts those origins for CSRF. The allowlist —
 * the apex and any subdomain of it, derived from `AUTH_URL` — is what keeps an
 * injected host header from impersonating another origin; any other host
 * (localhost in dev/E2E, an unlisted preview) falls back to `AUTH_URL`,
 * preserving the previous static behavior there. Mirrors `auth-client.ts`,
 * which targets the served origin on the client.
 */
const buildAuthBaseURL = (): BetterAuthOptions['baseURL'] => {
  const authUrl = process.env.AUTH_URL;
  if (!authUrl) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(authUrl);
  } catch {
    // Malformed AUTH_URL — hand it back unchanged (static string baseURL).
    return authUrl;
  }

  const apexHost = parsed.host.replace(/^www\./, '');
  return {
    allowedHosts: [apexHost, `*.${apexHost}`],
    protocol: parsed.protocol === 'http:' ? 'http' : 'https',
    fallback: authUrl,
  };
};

/**
 * Resolve the email for a userId so the ban-evasion gate can match on both
 * signals (the better-auth `session.create.before` hook only carries `userId`).
 * Failures are non-fatal — the gate still checks the userId.
 */
const resolveEmailForUser = async (userId: string): Promise<string | null> => {
  try {
    const record = await UserRepository.findEmailById(userId);
    return record?.email ?? null;
  } catch {
    return null;
  }
};

/**
 * better-auth instance. Passwordless (magic-link only), with the admin plugin
 * owning `role` + native ban, and the ban-evasion gate moved here from the old
 * Auth.js `signIn` callback.
 *
 * Adapter note: the Prisma adapter is used on MongoDB with
 * `advanced.database.generateId: false` so Mongo auto-generates `_id`
 * ObjectIds (better-auth's own string ids are not valid ObjectIds).
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'mongodb' }),
  secret: process.env.AUTH_SECRET,
  // Per-request base URL (apex + subdomains) so auth stays same-origin behind
  // the NGINX proxy; see `buildAuthBaseURL`. The dynamic config also derives the
  // trusted origins (the allowlisted hosts + the `AUTH_URL` fallback), so no
  // separate `trustedOrigins` is needed.
  baseURL: buildAuthBaseURL(),
  emailAndPassword: {
    // Passwordless: no username/password login, now or ever.
    enabled: false,
  },
  // Social OAuth providers. Each provider is conditionally included only when
  // its credentials are present in the environment (see social-providers-config.ts).
  // Redirect URIs are automatically handled by better-auth at:
  //   <AUTH_URL>/api/auth/callback/<provider>
  socialProviders: buildSocialProvidersConfig(),
  user: {
    additionalFields: {
      // Server-controlled; never writable from the client.
      role: { type: 'string', required: false, input: false },
      termsAcceptedAt: { type: 'date', required: false, input: false },
      // Surface `username` on the session so the client `useSession()` can render
      // the `@username` profile link (desktop/mobile auth menus). It is written
      // only via the dedicated change-username action (with uniqueness checks),
      // so `input: false` keeps it read-only through better-auth's updateUser.
      username: { type: 'string', required: false, input: false },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: SESSION_COOKIE_CACHE_MAX_AGE_SECONDS,
    },
  },
  account: {
    // Auto-link existing accounts by verified email when a trusted OAuth
    // provider is used. Twitter is excluded from trustedProviders because
    // X/Twitter does not reliably return an email without elevated permissions
    // — users must manually link their X account from their profile (Task 7).
    accountLinking: accountLinkingConfig,
  },
  rateLimit: {
    // better-auth enables its limiter whenever NODE_ENV === 'production',
    // which also captures the CI E2E standalone (production build, parallel
    // Playwright workers sharing one IP) — /api/auth/get-session then 429s
    // and signed-in UI intermittently renders signed-out. Scope the limiter
    // to REAL production; E2E keeps it off. Defaults (window/max) unchanged.
    enabled: isProductionRuntime,
  },
  advanced: {
    useSecureCookies: isProductionRuntime,
    cookiePrefix: 'boudreaux',
    // Let MongoDB generate `_id` ObjectIds (better-auth string ids are invalid
    // ObjectIds on the Prisma+Mongo adapter).
    database: { generateId: false },
  },
  databaseHooks: {
    user: {
      create: {
        // Runs on every user better-auth creates on its own paths (magic-link
        // auto-create for an unknown email at /signin, OAuth first sign-in).
        // Aborts creation (returns false) when signups are paused; otherwise
        // backfills a placeholder username. `username` is `@unique`, so a
        // null/absent value collides on the second such create — the prior
        // Auth.js adapter backfilled one for exactly this reason. The signup
        // action sets its own username, which is preserved.
        before: async (user) => userCreateBeforeHook(user),
      },
    },
    session: {
      create: {
        // Ban-evasion gate (010-chat-abuse-reporting): reject session creation
        // for any userId/email matching an active BannedIdentity. Returning
        // `false` is the better-auth clean-rejection idiom — it aborts the
        // session create without treating it as an unexpected error.
        before: async (session) => {
          const userId = session.userId ?? null;
          const email = userId ? await resolveEmailForUser(userId) : null;
          return assertNotBanEvading({ userId, email });
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_EXPIRES_IN_SECONDS,
      // Env-driven kill switch (see DISABLE_MAGIC_LINK_SIGNUP above). Default
      // false keeps signups open; OAuth first sign-ins are unaffected and still
      // get a backfilled username via the user.create hook.
      disableSignUp: DISABLE_MAGIC_LINK_SIGNUP,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ email, url });
      },
    }),
    admin(),
    // Server-only endpoint for Stripe post-purchase auto-login. Mints a real
    // better-auth session for an already-resolved userId; never on the public
    // HTTP router (SERVER_ONLY). Must precede nextCookies() so its Set-Cookie is
    // forwarded to Next.
    purchaseSessionPlugin,
    // nextCookies() MUST be last so it can set cookies on the response.
    nextCookies(),
  ],
});

// Apple client secret expiry telemetry: an immediate check at boot plus an
// hourly re-check. The warn line it emits under 30 days remaining is matched
// verbatim by the `apple-secret-expiry` Grafana alert rule. Production-only
// (E2E and dev never configure Apple credentials; builds resolve to null).
if (isProductionRuntime) {
  startAppleSecretExpiryMonitor(resolveAppleClientSecret());
}
