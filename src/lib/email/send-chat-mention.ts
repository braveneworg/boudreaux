/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import path from 'path';

import { SendRawEmailCommand } from '@aws-sdk/client-ses';
import nodemailer from 'nodemailer';

import { sesClient } from '@/lib/utils/ses-client';

import { buildChatMentionEmailHtml } from './chat-mention-email-html';
import { buildChatMentionEmailText } from './chat-mention-email-text';

interface SendChatMentionEmailInput {
  toEmail: string;
  recipientUsername: string;
  authorUsername: string;
  messageBody: string;
}

/**
 * Send a chat mention notification email. Returns `true` on success,
 * `false` if EMAIL_FROM is not configured or the SES dispatch failed —
 * the caller (ChatMentionService) is responsible for releasing the
 * Redis throttle slot on failure so subsequent mentions can retry.
 */
export async function sendChatMentionEmail(input: SendChatMentionEmailInput): Promise<boolean> {
  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) {
    console.error('[sendChatMentionEmail] EMAIL_FROM is not configured');
    return false;
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://fakefourrecords.com';
  // Email link → sign-in with a callback URL back to the landing page
  // carrying `chat=mention`. Auth.js will redirect to the callback when
  // a session is already present, and the chat launcher reads the param
  // to auto-open the drawer and scroll to the most recent mention of
  // the recipient's username.
  const landingTarget = '/?chat=mention';
  const signInUrl = `${baseUrl}/signin?callbackUrl=${encodeURIComponent(landingTarget)}`;

  const emailData = {
    recipientUsername: input.recipientUsername,
    authorUsername: input.authorUsername,
    messageBody: input.messageBody,
    signInUrl,
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
      subject: `${input.authorUsername} mentioned you on Fake Four Inc.`,
      text: buildChatMentionEmailText(emailData),
      html: buildChatMentionEmailHtml(emailData),
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
      `[sendChatMentionEmail] Email sent to ${input.toEmail} (mentioned by ${input.authorUsername})`
    );
    return true;
  } catch (error) {
    console.error(`Failed to send chat mention email to ${input.toEmail}:`, error);
    throw error;
  }
}
