/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { generateUsername } from 'unique-username-generator';

import { prisma } from '@/lib/prisma';
import { CustomPrismaAdapter } from '@/lib/prisma-adapter';
import { validateEmailSecurity } from '@/lib/utils/email-security';
import { rateLimit } from '@/lib/utils/rate-limit';

interface ResolveSubscriberInput {
  email: string;
  termsAccepted: boolean;
}

interface ResolveSubscriberResult {
  success: boolean;
  error?: string;
}

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

export const resolveSubscriberAction = async (
  input: ResolveSubscriberInput
): Promise<ResolveSubscriberResult> => {
  try {
    // Rate limit to prevent abuse
    await limiter.check(5, input.email).catch(() => {
      throw new Error('Too many requests. Please try again later.');
    });

    const { email, termsAccepted } = input;

    const emailValidation = validateEmailSecurity(email);
    if (!emailValidation.isValid) {
      return {
        success: false,
        error: emailValidation.error ?? 'Invalid email address',
      };
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Return uniform response to prevent email enumeration
      return { success: true };
    }

    if (!termsAccepted) {
      return {
        success: false,
        error: 'You must accept the terms and conditions',
      };
    }

    const adapter = CustomPrismaAdapter(prisma);
    await adapter.createUser!({
      id: '',
      email,
      emailVerified: null,
      name: null,
      image: null,
      username: generateUsername('', 4),
    });

    // Return uniform response to prevent email enumeration
    return { success: true };
  } catch (error: unknown) {
    console.error('Failed to resolve subscriber:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
};
