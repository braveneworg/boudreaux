/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import path from 'path';

import { SendRawEmailCommand } from '@aws-sdk/client-ses';
import nodemailer from 'nodemailer';

import { sesClient } from '@/lib/utils/ses-client';

import { buildAbuseReportEmailHtml } from './abuse-report-email-html';
import { buildAbuseReportEmailText } from './abuse-report-email-text';

interface SendAbuseReportNotificationInput {
  toEmail: string;
  recipientUsername: string;
  reportedUsername: string;
}

/**
 * Send an abuse-report notification email to a single admin. Returns
 * `true` on success, `false` if EMAIL_FROM is not configured. SES
 * dispatch failures throw so the fan-out caller can log per-recipient.
 *
 * Reporter identity is NEVER passed to this function — by construction,
 * the function cannot leak what it does not receive.
 */
export async function sendAbuseReportNotificationEmail(
  input: SendAbuseReportNotificationInput
): Promise<boolean> {
  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) {
    console.error('[sendAbuseReportNotificationEmail] EMAIL_FROM is not configured');
    return false;
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://fakefourrecords.com';
  const moderationTarget = '/admin/chat';
  // If the admin is already authenticated, Auth.js redirects straight
  // through to the callback URL after sign-in — no extra step.
  const moderationUrl = `${baseUrl}/signin?callbackUrl=${encodeURIComponent(moderationTarget)}`;

  const emailData = {
    recipientUsername: input.recipientUsername,
    reportedUsername: input.reportedUsername,
    moderationUrl,
  };

  const logoPath = path.join(process.cwd(), 'public', 'fake-four-inc-black-hand-logo.svg');

  const transport = nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  });

  try {
    const info = await transport.sendMail({
      from: fromAddress,
      to: input.toEmail,
      subject: `New abuse report: @${input.reportedUsername}`,
      text: buildAbuseReportEmailText(emailData),
      html: buildAbuseReportEmailHtml(emailData),
      attachments: [
        {
          filename: 'fake-four-inc-black-hand-logo.svg',
          path: logoPath,
          cid: 'logo@fakefourrecords.com',
          contentType: 'image/svg+xml',
        },
      ],
    });

    const rawMessage = (info as { message: Buffer }).message;

    const command = new SendRawEmailCommand({
      Source: fromAddress,
      Destinations: [input.toEmail],
      RawMessage: { Data: rawMessage },
    });

    await sesClient.send(command);
    console.info(
      `[sendAbuseReportNotificationEmail] Email sent to ${input.toEmail} (report against @${input.reportedUsername})`
    );
    return true;
  } catch (error) {
    console.error(`Failed to send abuse-report notification email to ${input.toEmail}:`, error);
    throw error;
  }
}
