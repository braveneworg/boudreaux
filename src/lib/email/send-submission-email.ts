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
 * and `false` when `EMAIL_FROM` is not configured. An SES failure rejects, so
 * a fan-out caller can log it per recipient and carry on with the rest.
 */
export const sendSubmissionEmail = async ({
  toEmail,
  subject,
  text,
  html,
}: SendSubmissionEmailInput): Promise<boolean> => {
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
