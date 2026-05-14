/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { buildAbuseReportEmailText } from './abuse-report-email-text';

describe('buildAbuseReportEmailText', () => {
  const data = {
    recipientUsername: 'admin1',
    reportedUsername: 'troll',
    moderationUrl: 'https://example.com/admin/chat',
  };

  it('renders a plain-text alert with the reported username', () => {
    const text = buildAbuseReportEmailText(data);
    expect(text).toContain('Hi admin1');
    expect(text).toContain('@troll');
    expect(text).toContain('https://example.com/admin/chat');
  });

  it('explicitly states reporter identity is withheld', () => {
    const text = buildAbuseReportEmailText(data).toLowerCase();
    expect(text).toContain('intentionally withheld');
  });
});
