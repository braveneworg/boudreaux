/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  SLUG_MAX,
  USERNAME_MAX,
  httpUrl,
  isSlug,
  isoDay,
  objectId,
  slug,
  username,
} from './primitives';

describe('objectId', () => {
  it('accepts a 24-hex id in either case', () => {
    expect(objectId.safeParse('507f1f77bcf86cd799439011').success).toBe(true);
    expect(objectId.safeParse('507F1F77BCF86CD799439011').success).toBe(true);
  });

  it('rejects the wrong length and non-hex characters', () => {
    expect(objectId.safeParse('507f1f77bcf86cd79943901').success).toBe(false);
    expect(objectId.safeParse('507f1f77bcf86cd79943901z').success).toBe(false);
  });
});

describe('slug', () => {
  it('accepts lowercase alphanumerics with single dashes', () => {
    expect(slug.safeParse('john-doe-2').success).toBe(true);
    expect(slug.safeParse('a').success).toBe(true);
  });

  it('rejects uppercase, spaces, leading, trailing and doubled dashes', () => {
    for (const value of ['John', 'john doe', '-john', 'john-', 'john--doe', '']) {
      expect(slug.safeParse(value).success).toBe(false);
    }
  });

  it(`caps at ${SLUG_MAX} characters — the ceiling every reachable artist page has lived under`, () => {
    expect(slug.safeParse('a'.repeat(SLUG_MAX)).success).toBe(true);
    expect(slug.safeParse('a'.repeat(SLUG_MAX + 1)).success).toBe(false);
  });
});

describe('isSlug', () => {
  it('is the boolean form of the slug primitive', () => {
    expect(isSlug('john-doe')).toBe(true);
    expect(isSlug('john--doe')).toBe(false);
  });
});

describe('username', () => {
  it('accepts letters, digits, underscores and dashes, 2 to the max', () => {
    expect(username.safeParse('ab').success).toBe(true);
    expect(username.safeParse('Jo_hn-9').success).toBe(true);
    expect(username.safeParse('a'.repeat(USERNAME_MAX)).success).toBe(true);
  });

  it('rejects one character, spaces, dots and anything past the max', () => {
    for (const value of ['a', 'jo hn', 'jo.hn', 'a'.repeat(USERNAME_MAX + 1)]) {
      expect(username.safeParse(value).success).toBe(false);
    }
  });
});

describe('isoDay', () => {
  it('accepts a real calendar day', () => {
    expect(isoDay.safeParse('2024-02-29').success).toBe(true);
  });

  it('rejects a non-day and an ISO datetime', () => {
    expect(isoDay.safeParse('2023-02-29').success).toBe(false);
    expect(isoDay.safeParse('2024-02-29T00:00:00Z').success).toBe(false);
  });
});

describe('httpUrl', () => {
  it('accepts http and https URLs with a host', () => {
    expect(httpUrl.safeParse('https://example.com/x').success).toBe(true);
  });

  it('rejects script-bearing schemes that z.string().url() would admit', () => {
    expect(httpUrl.safeParse('javascript:alert(1)').success).toBe(false);
    expect(httpUrl.safeParse('data:text/html,hi').success).toBe(false);
  });
});
