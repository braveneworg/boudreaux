/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { buildChatMentionEmailHtml } from './chat-mention-email-html';

describe('buildChatMentionEmailHtml', () => {
  const baseData = {
    recipientUsername: 'recipient',
    authorUsername: 'author',
    messageBody: 'Hello @recipient',
    signInUrl: 'https://example.com/signin?callbackUrl=%2F%3Fchat%3Dmention',
  };

  it('includes the recipient and author usernames', () => {
    const html = buildChatMentionEmailHtml(baseData);
    expect(html).toContain('recipient');
    expect(html).toContain('author');
  });

  it('embeds the sign-in URL in the CTA link', () => {
    const html = buildChatMentionEmailHtml(baseData);
    expect(html).toContain(baseData.signInUrl);
  });

  it('escapes HTML in the message body to prevent injection', () => {
    const html = buildChatMentionEmailHtml({
      ...baseData,
      messageBody: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;xss&quot;');
  });

  it('escapes ampersands and apostrophes in the body', () => {
    const html = buildChatMentionEmailHtml({
      ...baseData,
      messageBody: `Tom & Jerry's`,
    });
    expect(html).toContain('Tom &amp; Jerry&#039;s');
  });

  it('escapes HTML in the usernames', () => {
    const html = buildChatMentionEmailHtml({
      ...baseData,
      recipientUsername: '<b>recip</b>',
      authorUsername: '<i>auth</i>',
    });
    expect(html).toContain('&lt;b&gt;recip&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;auth&lt;/i&gt;');
  });

  it('truncates messages longer than 280 chars with an ellipsis', () => {
    const long = 'a'.repeat(400);
    const html = buildChatMentionEmailHtml({ ...baseData, messageBody: long });
    expect(html).toContain('…');
    expect(html).not.toContain('a'.repeat(400));
  });

  it('does not truncate a message at the 280-char boundary', () => {
    const exact = 'a'.repeat(280);
    const html = buildChatMentionEmailHtml({ ...baseData, messageBody: exact });
    expect(html).toContain(exact);
    expect(html).not.toContain('…');
  });

  it('returns a well-formed HTML document', () => {
    const html = buildChatMentionEmailHtml(baseData);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('</html>');
  });
});
