/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { cookies } from 'next/headers';

import { encode } from '@auth/core/jwt';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { generateUsername } from 'unique-username-generator';

import { prisma } from '@/lib/prisma';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { stripe } from '@/lib/stripe';

import { auth } from '../../../auth';

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

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
 * Create a JWT session cookie for a user after a completed purchase or
 * subscription checkout, enabling immediate downloads without requiring a
 * separate magic-link sign-in.
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

  if (!sessionId || !sessionId.startsWith('cs_')) {
    return { success: false, error: 'invalid_session_id' };
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error('[createPurchaseSession] AUTH_SECRET is not configured');
    return { success: false, error: 'server_error' };
  }

  try {
    // --- Resolve the user ---
    // 1. Try the PWYW purchase path first (DB-only, no external call).
    const purchase = await PurchaseRepository.findBySessionId(sessionId);
    let userId: string | undefined;
    let customerEmail: string | undefined;

    if (purchase) {
      userId = purchase.userId;
    } else {
      // 2. Subscription path: retrieve the Stripe session to get the customer email.
      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      if (stripeSession.status !== 'complete') {
        return { success: false, error: 'session_not_complete' };
      }
      customerEmail =
        stripeSession.customer_details?.email ?? stripeSession.customer_email ?? undefined;
      if (!customerEmail) {
        return { success: false, error: 'no_customer_email' };
      }
      const existingUser = await PurchaseRepository.findUserByEmail(customerEmail);
      if (existingUser) {
        userId = existingUser.id;
      } else {
        // Create a new user for first-time subscribers.
        // Guard against concurrent requests racing on the unique email index
        // (P2002) by re-fetching the user if creation fails.
        const placeholderUsername = generateUsername('', 0, 15);
        try {
          const newUser = await prisma.user.create({
            data: {
              email: customerEmail,
              emailVerified: new Date(),
              username: placeholderUsername,
            },
          });
          userId = newUser.id;
        } catch (createError) {
          if (
            createError instanceof PrismaClientKnownRequestError &&
            createError.code === 'P2002'
          ) {
            // Race condition: another request already created this user — re-fetch.
            const racedUser = await PurchaseRepository.findUserByEmail(customerEmail);
            if (racedUser) {
              userId = racedUser.id;
            } else {
              console.error(
                '[createPurchaseSession] P2002 race: user not found on re-fetch',
                customerEmail
              );
            }
          } else {
            throw createError;
          }
        }
      }
    }

    if (!userId) {
      return { success: false, error: 'user_not_found' };
    }

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
        stripeCustomerId: true,
        subscriptionStatus: true,
        subscriptionTier: true,
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
