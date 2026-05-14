/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { buildChatMentionEmailText } from './chat-mention-email-text';

describe('buildChatMentionEmailText', () => {
  const baseData = {
    recipientUsername: 'recipient',
    authorUsername: 'author',
    messageBody: 'Hello @recipient',
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
    const text = buildChatMentionEmailText({ ...baseData, messageBody: long });
    expect(text).toContain('…');
    expect(text).not.toContain('a'.repeat(400));
  });

  it('does not truncate a message at the 280-char boundary', () => {
    const exact = 'b'.repeat(280);
    const text = buildChatMentionEmailText({ ...baseData, messageBody: exact });
    expect(text).toContain(exact);
    expect(text).not.toContain('…');
  });

  it('starts with the Fake Four header', () => {
    const text = buildChatMentionEmailText(baseData);
    expect(text.startsWith('FAKE FOUR INC. — CHAT MENTION')).toBe(true);
  });
});
