/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LOGO_URL } from './constants.js';

import type { PurchaseConfirmationEmailData } from '../types.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildPurchaseConfirmationEmailHtml(data: PurchaseConfirmationEmailData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Purchase Confirmed</title>
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
                    <p style="margin: 4px 0 0; color: #a1a1aa; font-size: 13px;">Purchase Confirmed</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Thank you -->
          <tr>
            <td style="padding: 24px 32px 0;">
              <h2 style="margin: 0; color: #18181b; font-size: 18px; font-weight: 600;">Thank You!</h2>
              <p style="margin: 8px 0 0; color: #27272a; font-size: 14px; line-height: 1.6;">
                Your purchase of <strong>${escapeHtml(data.releaseTitle)}</strong> has been confirmed.
              </p>
            </td>
          </tr>

          <!-- Purchase Details -->
          <tr>
            <td style="padding: 20px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 6px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; background-color: #fafafa;">
                    <span style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Release</span>
                    <p style="margin: 4px 0 0; color: #18181b; font-size: 15px; font-weight: 500;">${escapeHtml(data.releaseTitle)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7;">
                    <span style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Amount Paid</span>
                    <p style="margin: 4px 0 0; color: #18181b; font-size: 15px;">${escapeHtml(data.amountPaid)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px;">
                    <span style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Account</span>
                    <p style="margin: 4px 0 0; color: #18181b; font-size: 15px;">${escapeHtml(data.email)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Download CTA -->
          <tr>
            <td style="padding: 24px 32px;">
              <p style="margin: 0 0 16px; color: #27272a; font-size: 14px; line-height: 1.6;">
                Your download is ready. You can download up to 5 times using the link below.
              </p>
              <a href="${data.downloadUrl}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">Download Now</a>
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
