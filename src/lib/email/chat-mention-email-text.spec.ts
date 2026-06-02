/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { buildChatMentionEmailText } from './chat-mention-email-text';

const ISO = '2026-05-18T12:00:00.000Z';

describe('buildChatMentionEmailText', () => {
  const baseData = {
    recipientUsername: 'recipient',
    mentions: [{ authorUsername: 'author', body: 'Hello @recipient', createdAt: ISO }],
    signInUrl: 'https://example.com/signin?callbackUrl=%2F%3Fchat%3Dmention',
  };

  it('includes both usernames', () => {
    const text = buildChatMentionEmailText(baseData);
    expect(text).toContain('recipient');
    expect(text).toContain('author');
  });

  it('includes the message body verbatim when under the truncation limit', () => {
    const text = buildChatMentionEmailText(baseData);
    expect(text).toContain('Hello @recipient');
  });

  it('includes the sign-in URL', () => {
    const text = buildChatMentionEmailText(baseData);
    expect(text).toContain(baseData.signInUrl);
  });

  it('truncates messages longer than 280 chars with an ellipsis', () => {
    const long = 'a'.repeat(400);
    const text = buildChatMentionEmailText({
      ...baseData,
      mentions: [{ authorUsername: 'author', body: long, createdAt: ISO }],
    });
    expect(text).toContain('…');
    expect(text).not.toContain('a'.repeat(400));
  });

  it('does not truncate a message at the 280-char boundary', () => {
    const exact = 'b'.repeat(280);
    const text = buildChatMentionEmailText({
      ...baseData,
      mentions: [{ authorUsername: 'author', body: exact, createdAt: ISO }],
    });
    expect(text).toContain(exact);
    expect(text).not.toContain('…');
  });

  it('starts with the Fake Four header for a single mention', () => {
    const text = buildChatMentionEmailText(baseData);
    expect(text.startsWith('FAKE FOUR INC. — CHAT MENTION')).toBe(true);
  });

  it('omits the timestamp separator when the createdAt is unparseable', () => {
    const text = buildChatMentionEmailText({
      ...baseData,
      mentions: [{ authorUsername: 'author', body: 'hi', createdAt: 'not-a-date' }],
    });
    expect(text).not.toContain('Invalid Date');
    // With no parseable stamp the author line has no " — <stamp>" suffix.
    expect(text).toContain('author:\nhi');
  });

  it('falls back to "Someone" in the intro when no author is available', () => {
    const text = buildChatMentionEmailText({ ...baseData, mentions: [] });
    expect(text).toContain('Someone mentioned you');
  });

  it('uses the digest header and lists every entry when multiple mentions are passed', () => {
    const text = buildChatMentionEmailText({
      ...baseData,
      mentions: [
        { authorUsername: 'a1', body: 'first', createdAt: ISO },
        { authorUsername: 'a2', body: 'second', createdAt: ISO },
      ],
    });
    expect(text.startsWith('FAKE FOUR INC. — 2 CHAT MENTIONS')).toBe(true);
    expect(text).toContain('a1');
    expect(text).toContain('a2');
    expect(text).toContain('first');
    expect(text).toContain('second');
  });
});
