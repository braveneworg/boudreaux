/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LOGO_URL } from './constants';

/**
 * One layout for every submission notice (ADR-0025): to approvers when a
 * submission awaits approval or is overdue, and to an owner when theirs is
 * approved or rejected. A notice names a title and links to the page; it
 * never carries the about or the writing.
 */

/** What one submission notice says, before it is laid out. */
export interface SubmissionEmailMessage {
  subject: string;
  /** The small line under the masthead, naming what the notice is about. */
  kicker: string;
  greetingName: string;
  paragraphs: string[];
  /** One labelled fact set apart from the prose, such as the title. */
  detail?: { label: string; value: string };
  action: { label: string; url: string };
}

/** A laid-out notice, ready to send. */
export interface SubmissionEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const paragraphHtml = (paragraph: string): string =>
  `<p style="margin: 12px 0 0; color: #27272a; font-size: 14px; line-height: 1.6;">${escapeHtml(paragraph)}</p>`;

const detailHtml = ({ label, value }: { label: string; value: string }): string => `
          <tr>
            <td style="padding: 20px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 6px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; background-color: #fafafa;">
                    <span style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">${escapeHtml(label)}</span>
                    <p style="margin: 4px 0 0; color: #18181b; font-size: 15px; line-height: 1.6;">${escapeHtml(value)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

const textFor = ({ greetingName, paragraphs, detail, action }: SubmissionEmailMessage): string =>
  [
    `Hi ${greetingName},`,
    ...paragraphs,
    ...(detail ? [`${detail.label}: ${detail.value}`] : []),
    `${action.label}: ${action.url}`,
    'Fake Four Inc.',
  ].join('\n\n');

const htmlFor = ({
  subject,
  kicker,
  greetingName,
  paragraphs,
  detail,
  action,
}: SubmissionEmailMessage): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background-color: #18181b; padding: 24px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <img src="${LOGO_URL}" alt="Fake Four Inc." width="96" height="98" style="display: block; border: 0;" />
                  </td>
                  <td style="vertical-align: middle; padding-left: 14px;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600; letter-spacing: -0.025em;">Fake Four Inc.</h1>
                    <p style="margin: 4px 0 0; color: #a1a1aa; font-size: 13px;">${escapeHtml(kicker)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 0;">
              <h2 style="margin: 0; color: #18181b; font-size: 18px; font-weight: 600;">Hi ${escapeHtml(greetingName)},</h2>
              ${paragraphs.map(paragraphHtml).join('\n              ')}
            </td>
          </tr>${detail ? detailHtml(detail) : ''}
          <tr>
            <td style="padding: 24px 32px 32px;">
              <a href="${escapeHtml(action.url)}" style="display: inline-block; background-color: #18181b; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 10px 20px; border-radius: 6px;">${escapeHtml(action.label)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/**
 * Lay a submission notice out as a subject, a plain-text body and an HTML
 * body. Everything in the message is escaped: a title or a rejection reason
 * is text a user or an approver typed.
 */
export const buildSubmissionEmail = (message: SubmissionEmailMessage): SubmissionEmail => ({
  subject: message.subject,
  text: textFor(message),
  html: htmlFor(message),
});
