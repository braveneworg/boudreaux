/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  chatReactionSchema,
  chatReactionsArraySchema,
  sendChatMessageSchema,
} from './chat-message-schema';

describe('sendChatMessageSchema', () => {
  const valid = { body: 'Hello world', fingerprint: 'abcdef1234567890' };

  it('accepts a valid payload', () => {
    expect(sendChatMessageSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(sendChatMessageSchema.safeParse({ ...valid, body: '' }).success).toBe(false);
  });

  it('rejects a whitespace-only body (trim collapses to empty)', () => {
    expect(sendChatMessageSchema.safeParse({ ...valid, body: '   ' }).success).toBe(false);
  });

  it('trims surrounding whitespace from the body', () => {
    const result = sendChatMessageSchema.parse({ ...valid, body: '   hi   ' });
    expect(result.body).toBe('hi');
  });

  it('accepts a body at the 2000-char limit', () => {
    expect(sendChatMessageSchema.safeParse({ ...valid, body: 'A'.repeat(2000) }).success).toBe(
      true
    );
  });

  it('rejects a body exceeding 2000 chars', () => {
    expect(sendChatMessageSchema.safeParse({ ...valid, body: 'A'.repeat(2001) }).success).toBe(
      false
    );
  });

  it('rejects a fingerprint shorter than 8 chars', () => {
    expect(sendChatMessageSchema.safeParse({ ...valid, fingerprint: 'short' }).success).toBe(false);
  });

  it('rejects a fingerprint longer than 64 chars', () => {
    expect(sendChatMessageSchema.safeParse({ ...valid, fingerprint: 'a'.repeat(65) }).success).toBe(
      false
    );
  });
});

describe('chatReactionSchema', () => {
  const validId = 'abcdef1234567890abcdef12';

  it('accepts a valid messageId + emoji', () => {
    expect(chatReactionSchema.safeParse({ messageId: validId, emoji: '🔥' }).success).toBe(true);
  });

  it('accepts a ZWJ-joined emoji within the size cap', () => {
    expect(chatReactionSchema.safeParse({ messageId: validId, emoji: '👩‍🚀' }).success).toBe(true);
  });

  it('rejects an invalid messageId', () => {
    expect(chatReactionSchema.safeParse({ messageId: 'not-an-id', emoji: '🔥' }).success).toBe(
      false
    );
  });

  it('rejects an empty emoji', () => {
    expect(chatReactionSchema.safeParse({ messageId: validId, emoji: '' }).success).toBe(false);
  });

  it('rejects an emoji exceeding 16 chars (likely pasted text)', () => {
    expect(
      chatReactionSchema.safeParse({ messageId: validId, emoji: 'A'.repeat(17) }).success
    ).toBe(false);
  });
});

describe('chatReactionsArraySchema', () => {
  it('accepts an empty array', () => {
    expect(chatReactionsArraySchema.safeParse([]).success).toBe(true);
  });

  it('accepts a well-formed entry', () => {
    const result = chatReactionsArraySchema.safeParse([
      { emoji: '🔥', userIds: ['abcdef1234567890abcdef12'] },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts entries whose userIds are non-ObjectId strings (loosened for embedded JSON)', () => {
    expect(chatReactionsArraySchema.safeParse([{ emoji: '🔥', userIds: ['user-1'] }]).success).toBe(
      true
    );
  });

  it('rejects entries with empty-string userIds', () => {
    expect(chatReactionsArraySchema.safeParse([{ emoji: '🔥', userIds: [''] }]).success).toBe(
      false
    );
  });

  it('rejects entries with a missing emoji', () => {
    expect(
      chatReactionsArraySchema.safeParse([{ userIds: ['abcdef1234567890abcdef12'] }]).success
    ).toBe(false);
  });

  it('rejects a non-array root', () => {
    expect(chatReactionsArraySchema.safeParse({}).success).toBe(false);
  });
});
