/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { buildChatMentionEmailHtml } from './chat-mention-email-html';

const ISO = '2026-05-18T12:00:00.000Z';

describe('buildChatMentionEmailHtml', () => {
  const baseData = {
    recipientUsername: 'recipient',
    mentions: [{ authorUsername: 'author', body: 'Hello @recipient', createdAt: ISO }],
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
      mentions: [
        { authorUsername: 'author', body: '<script>alert("xss")</script>', createdAt: ISO },
      ],
    });
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;xss&quot;');
  });

  it('escapes ampersands and apostrophes in the body', () => {
    const html = buildChatMentionEmailHtml({
      ...baseData,
      mentions: [{ authorUsername: 'author', body: `Tom & Jerry's`, createdAt: ISO }],
    });
    expect(html).toContain('Tom &amp; Jerry&#039;s');
  });

  it('escapes HTML in the recipient username', () => {
    const html = buildChatMentionEmailHtml({
      ...baseData,
      recipientUsername: '<b>recip</b>',
    });
    expect(html).toContain('&lt;b&gt;recip&lt;/b&gt;');
  });

  it('truncates messages longer than 280 chars with an ellipsis', () => {
    const long = 'a'.repeat(400);
    const html = buildChatMentionEmailHtml({
      ...baseData,
      mentions: [{ authorUsername: 'author', body: long, createdAt: ISO }],
    });
    expect(html).toContain('…');
    expect(html).not.toContain('a'.repeat(400));
  });

  it('does not truncate a message at the 280-char boundary', () => {
    const exact = 'a'.repeat(280);
    const html = buildChatMentionEmailHtml({
      ...baseData,
      mentions: [{ authorUsername: 'author', body: exact, createdAt: ISO }],
    });
    expect(html).toContain(exact);
    expect(html).not.toContain('…');
  });

  it('returns a well-formed HTML document', () => {
    const html = buildChatMentionEmailHtml(baseData);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('</html>');
  });

  it('renders an empty timestamp when the createdAt is unparseable', () => {
    const html = buildChatMentionEmailHtml({
      ...baseData,
      mentions: [{ authorUsername: 'author', body: 'hi', createdAt: 'not-a-date' }],
    });
    expect(html).not.toContain('Invalid Date');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('falls back to "Someone" in the intro when no author is available', () => {
    // An empty mention list drives `mentions[0]?.authorUsername` to undefined,
    // exercising the `?? 'Someone'` fallback in the single-mention intro.
    const html = buildChatMentionEmailHtml({ ...baseData, mentions: [] });
    expect(html).toContain('Someone');
  });

  it('renders a digest header and each mention card when multiple entries are passed', () => {
    const html = buildChatMentionEmailHtml({
      ...baseData,
      mentions: [
        { authorUsername: 'a1', body: 'first message', createdAt: ISO },
        { authorUsername: 'a2', body: 'second message', createdAt: ISO },
        { authorUsername: 'a3', body: 'third message', createdAt: ISO },
      ],
    });
    expect(html).toContain('3 new mentions');
    expect(html).toContain('Chat Mentions (3)');
    expect(html).toContain('first message');
    expect(html).toContain('second message');
    expect(html).toContain('third message');
    expect(html).toContain('a1');
    expect(html).toContain('a2');
    expect(html).toContain('a3');
  });
});
