/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export interface LoginVerificationEmailData {
  url: string;
  email: string;
  isNewUser: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildLoginVerificationEmailHtml(data: LoginVerificationEmailData): string {
  const heading = data.isNewUser ? 'Welcome to Fake Four Inc.!' : 'Welcome back!';
  const message = data.isNewUser
    ? "We're glad you're here. Click the button below to sign in and start exploring our releases."
    : 'Click the button below to sign in to your account.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign In to Fake Four Inc.</title>
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
                  <td style="vertical-align: middle; padding-right: 14px;">
                    <img src="cid:logo@fakefourrecords.com" alt="Fake Four Inc." width="40" height="45" style="display: block; border: 0;" />
                  </td>
                  <td style="vertical-align: middle;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600; letter-spacing: -0.025em;">Fake Four Inc.</h1>
                    <p style="margin: 4px 0 0; color: #a1a1aa; font-size: 13px;">Sign-In Request</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 24px 32px 0;">
              <h2 style="margin: 0; color: #18181b; font-size: 18px; font-weight: 600;">${escapeHtml(heading)}</h2>
              <p style="margin: 8px 0 0; color: #27272a; font-size: 14px; line-height: 1.6;">
                ${escapeHtml(message)}
              </p>
            </td>
          </tr>

          <!-- Account Row -->
          <tr>
            <td style="padding: 20px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 6px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; background-color: #fafafa;">
                    <span style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Signing in as</span>
                    <p style="margin: 4px 0 0; color: #18181b; font-size: 15px; font-weight: 500;">${escapeHtml(data.email)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sign-In CTA -->
          <tr>
            <td style="padding: 24px 32px;">
              <p style="margin: 0 0 16px; color: #27272a; font-size: 14px; line-height: 1.6;">
                This link expires in 24 hours and can only be used once.
              </p>
              <a href="${data.url}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">Sign In</a>
            </td>
          </tr>

          <!-- Security Note -->
          <tr>
            <td style="padding: 0 32px 20px;">
              <p style="margin: 0; color: #71717a; font-size: 12px; line-height: 1.6;">
                If you did not request this email, you can safely ignore it. Your account will not be affected.
              </p>
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
