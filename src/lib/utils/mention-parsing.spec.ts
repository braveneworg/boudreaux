/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { extractMentionUsernames, tokenizeMentions } from './mention-parsing';

describe('extractMentionUsernames', () => {
  it('returns an empty array when there are no mentions', () => {
    expect(extractMentionUsernames('hello world')).toEqual([]);
  });

  it('extracts a single @mention at the start of the body', () => {
    expect(extractMentionUsernames('@alice hi')).toEqual(['alice']);
  });

  it('extracts mentions preceded by whitespace or punctuation', () => {
    expect(extractMentionUsernames('hi @alice, and @bob!')).toEqual(['alice', 'bob']);
  });

  it('lowercases the captured usernames', () => {
    expect(extractMentionUsernames('@Alice hello @BOB')).toEqual(['alice', 'bob']);
  });

  it('deduplicates repeated mentions preserving first-seen order', () => {
    expect(extractMentionUsernames('@alice and @bob and @alice')).toEqual(['alice', 'bob']);
  });

  it('does not treat email-like patterns as mentions', () => {
    expect(extractMentionUsernames('contact foo@bar.com please')).toEqual([]);
  });

  it('does not treat back-to-back @ as a mention', () => {
    expect(extractMentionUsernames('@@alice')).toEqual([]);
  });

  it('caps usernames at 32 characters', () => {
    const long = 'a'.repeat(40);
    expect(extractMentionUsernames(`@${long}`)).toEqual([long.slice(0, 32)]);
  });
});

describe('tokenizeMentions', () => {
  it('returns a single text token when there are no mentions', () => {
    expect(tokenizeMentions('hello')).toEqual([{ kind: 'text', value: 'hello' }]);
  });

  it('returns an empty array for an empty body', () => {
    expect(tokenizeMentions('')).toEqual([]);
  });

  it('emits leading prefix text, the mention, and trailing text', () => {
    const tokens = tokenizeMentions('hey @alice ok');
    expect(tokens).toEqual([
      { kind: 'text', value: 'hey ' },
      { kind: 'mention', value: '@alice', username: 'alice' },
      { kind: 'text', value: ' ok' },
    ]);
  });

  it('emits a mention at the very start of the body', () => {
    const tokens = tokenizeMentions('@alice hi');
    expect(tokens[0]).toEqual({ kind: 'mention', value: '@alice', username: 'alice' });
    expect(tokens[1]).toEqual({ kind: 'text', value: ' hi' });
  });

  it('keeps the original case of the username on the mention token', () => {
    const tokens = tokenizeMentions('@Alice');
    expect(tokens[0]).toEqual({ kind: 'mention', value: '@Alice', username: 'Alice' });
  });

  it('handles multiple mentions interleaved with text', () => {
    const tokens = tokenizeMentions('@a and @b and @c');
    const mentions = tokens.filter((t) => t.kind === 'mention').map((t) => t.value);
    expect(mentions).toEqual(['@a', '@b', '@c']);
  });

  it('does not emit mention tokens for email-like substrings', () => {
    const tokens = tokenizeMentions('reach me at foo@bar.com');
    expect(tokens.every((t) => t.kind === 'text')).toBe(true);
  });
});
