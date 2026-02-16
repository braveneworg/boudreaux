/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

interface ContactEmailData {
  reason: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message: string;
  timestamp: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildContactEmailHtml(data: ContactEmailData): string {
  const messageHtml = escapeHtml(data.message).replace(/\n/g, '<br />');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contact Form Submission</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #18181b; padding: 24px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600; letter-spacing: -0.025em;">Fake Four Inc.</h1>
              <p style="margin: 4px 0 0; color: #a1a1aa; font-size: 13px;">Contact Form Submission</p>
            </td>
          </tr>

          <!-- Reason Badge -->
          <tr>
            <td style="padding: 24px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #27272a; color: #ffffff; font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em;">
                    ${escapeHtml(data.reason)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sender Info -->
          <tr>
            <td style="padding: 20px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 6px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; background-color: #fafafa;">
                    <span style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">From</span>
                    <p style="margin: 4px 0 0; color: #18181b; font-size: 15px; font-weight: 500;">${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7;">
                    <span style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Email</span>
                    <p style="margin: 4px 0 0; color: #18181b; font-size: 15px;">
                      <a href="mailto:${escapeHtml(data.email)}" style="color: #2563eb; text-decoration: none;">${escapeHtml(data.email)}</a>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px;">
                    <span style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Phone</span>
                    <p style="margin: 4px 0 0; color: #18181b; font-size: 15px;">${data.phone ? escapeHtml(data.phone) : '<span style="color: #a1a1aa;">Not provided</span>'}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding: 20px 32px;">
              <p style="margin: 0 0 8px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Message</p>
              <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; padding: 16px; color: #27272a; font-size: 14px; line-height: 1.6;">
                ${messageHtml}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px 24px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; text-align: center;">
                Sent via fakefourrecords.com contact form<br />
                ${escapeHtml(data.timestamp)}
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
