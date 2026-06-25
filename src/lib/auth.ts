/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { admin, magicLink } from 'better-auth/plugins';

import { assertNotBanEvading } from '@/lib/auth/ban-evasion-hook';
import { purchaseSessionPlugin } from '@/lib/auth/purchase-session-plugin';
import {
  accountLinkingConfig,
  buildSocialProvidersConfig,
} from '@/lib/auth/social-providers-config';
import { sendMagicLinkEmail } from '@/lib/email/send-magic-link-email';
import { prisma } from '@/lib/prisma';
import { UserRepository } from '@/lib/repositories/user-repository';

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
  baseURL: process.env.AUTH_URL,
  // Trust the proxy (NGINX) host header — required behind a reverse proxy.
  trustedOrigins: process.env.AUTH_URL ? [process.env.AUTH_URL] : [],
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
  advanced: {
    useSecureCookies: isProductionRuntime,
    cookiePrefix: 'boudreaux',
    // Let MongoDB generate `_id` ObjectIds (better-auth string ids are invalid
    // ObjectIds on the Prisma+Mongo adapter).
    database: { generateId: false },
  },
  databaseHooks: {
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
