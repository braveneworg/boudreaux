/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LOGO_URL } from './constants';

export interface ChatMentionEntry {
  authorUsername: string;
  body: string;
  /** ISO timestamp; rendered as a localized short string in the email. */
  createdAt: string;
}

export interface ChatMentionEmailData {
  recipientUsername: string;
  mentions: ChatMentionEntry[];
  signInUrl: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Trim long messages so the email preview stays readable. */
function truncate(text: string, max = 280): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toUTCString();
}

function renderMentionCard(mention: ChatMentionEntry, includeAuthor: boolean): string {
  const safeBody = escapeHtml(truncate(mention.body));
  const safeAuthor = escapeHtml(mention.authorUsername);
  const timestamp = formatTimestamp(mention.createdAt);
  const header = includeAuthor
    ? `<strong style="color: #18181b;">${safeAuthor}</strong><span style="color: #71717a;"> &middot; ${escapeHtml(timestamp)}</span>`
    : `<span style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Message</span>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 6px; overflow: hidden; margin-bottom: 12px;">
              <tr>
                <td style="padding: 12px 16px; background-color: #fafafa;">
                  <div style="font-size: 13px; margin-bottom: 4px;">${header}</div>
                  <p style="margin: 4px 0 0; color: #18181b; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${safeBody}</p>
                </td>
              </tr>
            </table>`;
}

export function buildChatMentionEmailHtml(data: ChatMentionEmailData): string {
  const isDigest = data.mentions.length > 1;
  const headerLabel = isDigest ? `Chat Mentions (${data.mentions.length})` : 'Chat Mention';
  const title = isDigest
    ? `You have ${data.mentions.length} new mentions, ${escapeHtml(data.recipientUsername)}.`
    : `You were mentioned, ${escapeHtml(data.recipientUsername)}.`;
  const intro = isDigest
    ? `You were mentioned ${data.mentions.length} times in Fake Four Inc. chat.`
    : `<strong>${escapeHtml(data.mentions[0]?.authorUsername ?? 'Someone')}</strong> mentioned you in Fake Four Inc. chat.`;
  const cards = data.mentions.map((m) => renderMentionCard(m, isDigest)).join('\n              ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You were mentioned in Fake Four Inc. chat</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: #18181b; padding: 24px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <img src="${LOGO_URL}" alt="Fake Four Inc." width="96" height="98" style="display: block; border: 0;" />
                  </td>
                  <td style="vertical-align: middle; padding-left: 14px;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600; letter-spacing: -0.025em;">Fake Four Inc.</h1>
                    <p style="margin: 4px 0 0; color: #a1a1aa; font-size: 13px;">${headerLabel}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 24px 32px 0;">
              <h2 style="margin: 0; color: #18181b; font-size: 18px; font-weight: 600;">${title}</h2>
              <p style="margin: 8px 0 0; color: #27272a; font-size: 14px; line-height: 1.6;">
                ${intro}
              </p>
            </td>
          </tr>

          <!-- Messages -->
          <tr>
            <td style="padding: 20px 32px 0;">
              ${cards}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 12px 32px 24px;">
              <p style="margin: 0 0 16px; color: #27272a; font-size: 14px; line-height: 1.6;">
                Open the chat to jump straight to the mention.
              </p>
              <a href="${data.signInUrl}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">Open chat</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px 24px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; text-align: center;">
                Fake Four Inc. &mdash; fakefourrecords.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
