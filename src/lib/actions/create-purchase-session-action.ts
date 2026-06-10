/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { cookies, headers } from 'next/headers';

import { encode } from '@auth/core/jwt';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { extractClientIpFromHeaders } from '@/lib/utils/extract-client-ip';
import { rateLimit } from '@/lib/utils/rate-limit';

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// This action mints a session cookie from a Stripe checkout session ID with
// no prior authentication — the same posture as signin, so it gets the same
// 5/min/IP throttle to shut down session-ID guessing and DB-lookup floods.
const limiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

/**
 * Resolves the session cookie name and attributes to match the configuration
 * in `auth.ts`. This must stay in sync with the auth config.
 */
function getSessionCookieConfig() {
  const isSecure = process.env.NODE_ENV === 'production' && process.env.E2E_MODE !== 'true';
  const name = isSecure ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
  return {
    name,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      secure: isSecure,
    },
  };
}

interface CreatePurchaseSessionInput {
  sessionId: string;
}

interface CreatePurchaseSessionResult {
  success: boolean;
  error?: string;
}

/**
 * Create a JWT session cookie for a user after a completed purchase, enabling
 * immediate downloads without requiring a separate magic-link sign-in.
 *
 * The Stripe checkout session ID is used as the trust anchor — only a client
 * that initiated the checkout possesses it.
 */
export async function createPurchaseSessionAction(
  input: CreatePurchaseSessionInput
): Promise<CreatePurchaseSessionResult> {
  const { sessionId } = input;

  // Skip if the user is already authenticated.
  const existingSession = await auth();
  if (existingSession?.user?.id) {
    return { success: true };
  }

  // Rate limit unauthenticated callers (E2E shards share one IP, so the
  // harness opts out the same way withRateLimit does).
  if (process.env.E2E_MODE !== 'true') {
    const ip = extractClientIpFromHeaders(await headers());
    try {
      await limiter.check(5, ip);
    } catch {
      return { success: false, error: 'rate_limited' };
    }
  }

  if (!sessionId || !sessionId.startsWith('cs_')) {
    return { success: false, error: 'invalid_session_id' };
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error('[createPurchaseSession] AUTH_SECRET is not configured');
    return { success: false, error: 'server_error' };
  }

  try {
    // Resolve the user via the PWYW purchase record (DB-only, no external call).
    const purchase = await PurchaseRepository.findBySessionId(sessionId);
    if (!purchase) {
      return { success: false, error: 'user_not_found' };
    }
    const userId = purchase.userId;

    // --- Build the JWT payload ---
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        role: true,
        image: true,
        emailVerified: true,
        firstName: true,
        lastName: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        zipCode: true,
        country: true,
        allowSmsNotifications: true,
      },
    });

    if (!user) {
      return { success: false, error: 'user_not_found' };
    }

    // --- Create the JWE session token ---
    // `sub` is required: download endpoints use `getToken()` which reads
    // `token.sub` as the user ID. Auth.js normally sets this in the JWT
    // callback, but `encode()` bypasses callbacks — we must set it manually.
    const cookieConfig = getSessionCookieConfig();
    const token = await encode({
      token: { sub: user.id, user },
      secret,
      salt: cookieConfig.name,
      maxAge: SESSION_MAX_AGE,
    });

    // --- Set the session cookie ---
    const cookieStore = await cookies();
    cookieStore.set(cookieConfig.name, token, {
      ...cookieConfig.options,
      maxAge: SESSION_MAX_AGE,
    });

    return { success: true };
  } catch (error) {
    console.error(error);
    console.error(
      '[createPurchaseSession] Failed to create session:',
      error instanceof Error ? error.message : error
    );
    return { success: false, error: 'server_error' };
  }
}
