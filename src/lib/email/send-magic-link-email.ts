/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import path from 'path';

import nodemailer from 'nodemailer';

import { prisma } from '@/lib/prisma';
import { loggers } from '@/lib/utils/logger';
import { rateLimit } from '@/lib/utils/rate-limit';

import { buildLoginVerificationEmailHtml } from './login-verification-email-html';
import { buildLoginVerificationEmailText } from './login-verification-email-text';

// Throttle outbound sign-in emails per recipient address. This is the single
// chokepoint for every better-auth magic-link send, closing an email-bombing /
// SES-cost amplification vector. 5 per 10 minutes comfortably covers a real
// user retrying a lost email.
const verificationEmailLimiter = rateLimit({
  interval: 10 * 60 * 1000,
  uniqueTokenPerInterval: 500,
});
const VERIFICATION_EMAILS_PER_INTERVAL = 5;

/** Input passed by better-auth's `magicLink.sendMagicLink` callback. */
export interface SendMagicLinkEmailInput {
  /** The recipient email address. */
  email: string;
  /** The fully-formed better-auth magic-link verification URL. */
  url: string;
}

/**
 * Build the Nodemailer SMTP transport options from the EMAIL_SERVER_* env vars.
 * Mirrors the configuration the Auth.js Nodemailer provider used previously.
 */
const buildSmtpOptions = () => ({
  host: process.env.EMAIL_SERVER_HOST,
  port: Number(process.env.EMAIL_SERVER_PORT ?? 25),
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
});

/**
 * Determine whether this is a first-time user, for the conditional greeting.
 * Falls back to treating the user as returning if the lookup fails, so the
 * email still sends without blocking sign-in.
 */
const resolveIsNewUser = async (email: string): Promise<boolean> => {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return existingUser === null;
  } catch (error) {
    loggers.auth.error('[sendMagicLinkEmail] Failed to look up user', error);
    return false;
  }
};

/**
 * Send a branded magic-link sign-in email via Nodemailer for better-auth.
 *
 * Reuses the existing HTML/text templates and the Fake Four Inc. hand-logo
 * inline attachment, and enforces the per-recipient rate limit (5 / 10 min,
 * skipped under E2E).
 *
 * @throws If the recipient is rate-limited, EMAIL_FROM is missing, or the
 *   underlying SMTP send fails (better-auth surfaces the error to the caller).
 */
export const sendMagicLinkEmail = async ({
  email,
  url,
}: SendMagicLinkEmailInput): Promise<void> => {
  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) {
    throw new Error('[sendMagicLinkEmail] EMAIL_FROM is not configured');
  }

  if (process.env.E2E_MODE !== 'true') {
    try {
      await verificationEmailLimiter.check(VERIFICATION_EMAILS_PER_INTERVAL, email.toLowerCase());
    } catch {
      throw new Error('Too many sign-in emails requested. Please try again later.');
    }
  }

  const isNewUser = await resolveIsNewUser(email);
  const emailData = { url, email, isNewUser };

  const logoPath = path.join(process.cwd(), 'public', 'fake-four-inc-black-hand-logo.svg');

  const transport = nodemailer.createTransport(
    buildSmtpOptions() as Parameters<typeof nodemailer.createTransport>[0]
  );

  await transport.sendMail({
    from: fromAddress,
    to: email,
    subject: isNewUser
      ? 'Welcome to Fake Four Inc. — Sign In'
      : 'Welcome back — Sign In to Fake Four Inc.',
    text: buildLoginVerificationEmailText(emailData),
    html: buildLoginVerificationEmailHtml(emailData),
    attachments: [
      {
        filename: 'fake-four-inc-black-hand-logo.svg',
        path: logoPath,
        cid: 'logo@fakefourrecords.com',
        contentType: 'image/svg+xml',
      },
    ],
  });

  loggers.auth.info(`[sendMagicLinkEmail] Magic-link email sent to ${email}`);
};
