/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import path from 'path';

import nodemailer from 'nodemailer';

import { prisma } from '@/lib/prisma';

import { buildLoginVerificationEmailHtml } from './login-verification-email-html';
import { buildLoginVerificationEmailText } from './login-verification-email-text';

interface SmtpServer {
  host?: string;
  port?: number;
  auth?: {
    user?: string;
    pass?: string;
  };
}

export interface SendVerificationRequestParams {
  identifier: string;
  url: string;
  provider: {
    server?: string | SmtpServer;
    from?: string;
  };
}

/**
 * Custom Auth.js verification request handler.
 *
 * Sends a branded magic-link sign-in email via Nodemailer with:
 * - A conditional greeting (new user welcome vs. returning user welcome-back)
 * - The Fake Four Inc. hand logo as a CID-embedded inline image
 * - Both HTML and plain-text bodies
 *
 * @throws If the email fails to send (Auth.js will surface the error to the user)
 */
export async function sendVerificationRequest(
  params: SendVerificationRequestParams
): Promise<void> {
  const { identifier: email, url, provider } = params;

  const fromAddress = provider.from ?? process.env.EMAIL_FROM;
  if (!fromAddress) {
    throw new Error('[sendVerificationRequest] EMAIL_FROM is not configured');
  }

  // Determine whether this is a first-time user for the conditional greeting.
  let isNewUser = false;
  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    isNewUser = existingUser === null;
  } catch (error) {
    // If the DB lookup fails, fall back to treating the user as returning so
    // the email still sends without blocking sign-in.
    console.error('[sendVerificationRequest] Failed to look up user:', error);
  }

  const emailData = { url, email, isNewUser };

  const logoPath = path.join(process.cwd(), 'public', 'fake-four-inc-black-hand-logo.svg');

  const transport = nodemailer.createTransport(
    provider.server as Parameters<typeof nodemailer.createTransport>[0]
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

  console.info(`[sendVerificationRequest] Verification email sent to ${email}`);
}
