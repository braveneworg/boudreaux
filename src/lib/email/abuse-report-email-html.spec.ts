/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { buildAbuseReportEmailHtml } from './abuse-report-email-html';

describe('buildAbuseReportEmailHtml', () => {
  const data = {
    recipientUsername: 'admin1',
    reportedUsername: 'troll',
    moderationUrl: 'https://example.com/signin?callbackUrl=%2Fadmin%2Fchat',
  };

  it('includes the recipient username in the greeting', () => {
    expect(buildAbuseReportEmailHtml(data)).toContain('Hi admin1');
  });

  it('renders the reported username with the @ prefix', () => {
    expect(buildAbuseReportEmailHtml(data)).toContain('@troll');
  });

  it('renders the moderation CTA href', () => {
    const html = buildAbuseReportEmailHtml(data);
    expect(html).toContain('href="https://example.com/signin?callbackUrl=%2Fadmin%2Fchat"');
    expect(html).toContain('Log in to moderate');
  });

  it('escapes HTML in the reported username', () => {
    const html = buildAbuseReportEmailHtml({
      ...data,
      reportedUsername: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in the recipient username', () => {
    const html = buildAbuseReportEmailHtml({
      ...data,
      recipientUsername: '<b>boss</b>',
    });
    expect(html).not.toContain('<b>boss</b>');
    expect(html).toContain('&lt;b&gt;boss&lt;/b&gt;');
  });

  it('never leaks reporter-identifying fields (anonymity guard)', () => {
    // The template's data shape does not include reporter fields, so
    // by construction the HTML cannot include a reporter id or
    // fingerprint hash. This guard pins that contract.
    const reporterId = '5f9d5b7a3b9d4f5a3b9d4f5a';
    const reporterHash = 'abc123def456';
    const html = buildAbuseReportEmailHtml({
      ...data,
      // @ts-expect-error — these fields are intentionally not part of
      // AbuseReportEmailData; passing them should be a no-op.
      reporterId,
      reporterFingerprint: reporterHash,
    });
    expect(html).not.toContain(reporterId);
    expect(html).not.toContain(reporterHash);
    expect(html.toLowerCase()).not.toContain('submitted by');
  });
});
