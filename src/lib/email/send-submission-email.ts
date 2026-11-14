/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { SendRawEmailCommand } from '@aws-sdk/client-ses';
import nodemailer from 'nodemailer';

import { loggers } from '@/lib/utils/logger';
import { sesClient } from '@/lib/utils/ses-client';

interface SendSubmissionEmailInput {
  toEmail: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Send one laid-out submission notice through SES. Returns `true` on success
 * and `false` when nothing was sent: `EMAIL_FROM` is not configured, or this
 * is an E2E run. An SES failure rejects, so a fan-out caller can log it per
 * recipient and carry on with the rest.
 */
export const sendSubmissionEmail = async ({
  toEmail,
  subject,
  text,
  html,
}: SendSubmissionEmailInput): Promise<boolean> => {
  // An E2E run has no mailbox to deliver to, and a worktree's copied env files
  // may hold live mail credentials: never send from one. Safe because
  // `auth.ts` refuses to start with `E2E_MODE` enabled in production.
  if (process.env.E2E_MODE === 'true') {
    loggers.notifications.info(`[sendSubmissionEmail] Skipping "${subject}" (E2E mode)`);
    return false;
  }

  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) {
    loggers.notifications.error('[sendSubmissionEmail] EMAIL_FROM is not configured');
    return false;
  }

  // Compose the MIME message locally, then hand SES the raw bytes, as every
  // other notice here does.
  const transport = nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  });
  const info = await transport.sendMail({ from: fromAddress, to: toEmail, subject, text, html });
  const rawMessage = (info as { message: Buffer }).message;

  await sesClient.send(
    new SendRawEmailCommand({
      Source: fromAddress,
      Destinations: [toEmail],
      RawMessage: { Data: rawMessage },
    })
  );

  return true;
};
