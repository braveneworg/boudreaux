/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { LOGO_URL } from './constants';

export interface AbuseReportEmailData {
  recipientUsername: string;
  /** Username of the user the report was filed against. */
  reportedUsername: string;
  /** Deep-link to the admin chat moderation view (or sign-in CTA). */
  moderationUrl: string;
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/**
 * Build the HTML body for the admin "new abuse report" alert email.
 *
 * Privacy: reporter identity is deliberately absent from this template.
 * The data shape does not even accept a reporter field — the build
 * function cannot leak what it never receives.
 */
export const buildAbuseReportEmailHtml = (data: AbuseReportEmailData): string => {
  const safeUsername = escapeHtml(data.reportedUsername);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New abuse report — Fake Four Inc.</title>
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
                    <p style="margin: 4px 0 0; color: #a1a1aa; font-size: 13px;">Abuse Report</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 24px 32px 0;">
              <h2 style="margin: 0; color: #18181b; font-size: 18px; font-weight: 600;">Hi ${escapeHtml(data.recipientUsername)},</h2>
              <p style="margin: 8px 0 0; color: #27272a; font-size: 14px; line-height: 1.6;">
                A community member has submitted an abuse report against
                <strong>@${safeUsername}</strong>. Please review when you have a moment.
              </p>
            </td>
          </tr>

          <!-- Detail block -->
          <tr>
            <td style="padding: 20px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 6px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; background-color: #fafafa;">
                    <span style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Reported user</span>
                    <p style="margin: 4px 0 0; color: #18181b; font-size: 15px; line-height: 1.6;">@${safeUsername}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 24px 32px;">
              <p style="margin: 0 0 16px; color: #27272a; font-size: 14px; line-height: 1.6;">
                Reporter identity is intentionally withheld. Open the moderation view to review the user's recent messages.
              </p>
              <a href="${data.moderationUrl}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">Log in to moderate</a>
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
};
