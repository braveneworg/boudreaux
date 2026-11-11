/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { buildSubmissionEmail, type SubmissionEmailMessage } from './submission-email';

const message: SubmissionEmailMessage = {
  subject: 'Awaiting approval: Bus poem',
  kicker: 'Community',
  greetingName: 'manager1',
  paragraphs: ['A submission is awaiting approval.', 'Please review it when you have a moment.'],
  detail: { label: 'Title', value: 'Bus poem' },
  action: { label: 'Review it', url: 'https://example.com/admin/community/abc' },
};

describe('buildSubmissionEmail', () => {
  it('passes the subject through', () => {
    expect(buildSubmissionEmail(message).subject).toBe('Awaiting approval: Bus poem');
  });

  it('writes the plain text as greeting, paragraphs, detail and link', () => {
    expect(buildSubmissionEmail(message).text).toBe(
      [
        'Hi manager1,',
        '',
        'A submission is awaiting approval.',
        '',
        'Please review it when you have a moment.',
        '',
        'Title: Bus poem',
        '',
        'Review it: https://example.com/admin/community/abc',
        '',
        'Fake Four Inc.',
      ].join('\n')
    );
  });

  it('leaves the detail line out of the text when there is none', () => {
    const { detail: _detail, ...withoutDetail } = message;

    expect(buildSubmissionEmail(withoutDetail).text).not.toContain('Title:');
  });

  it('puts every part into the HTML', () => {
    const { html } = buildSubmissionEmail(message);

    expect(html).toContain('Hi manager1,');
    expect(html).toContain('A submission is awaiting approval.');
    expect(html).toContain('Bus poem');
    expect(html).toContain('href="https://example.com/admin/community/abc"');
    expect(html).toContain('Review it');
  });

  it('escapes markup in everything a user wrote', () => {
    const { html } = buildSubmissionEmail({
      ...message,
      greetingName: '<b>mgr</b>',
      paragraphs: ['Reason: <script>alert(1)</script>'],
      detail: { label: 'Title', value: '"><img src=x onerror=alert(1)>' },
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>mgr</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes a quote in the action URL so it cannot leave the attribute', () => {
    const { html } = buildSubmissionEmail({
      ...message,
      action: { label: 'Open', url: 'https://example.com/?a="onmouseover="x' },
    });

    expect(html).toContain('href="https://example.com/?a=&quot;onmouseover=&quot;x"');
  });
});
