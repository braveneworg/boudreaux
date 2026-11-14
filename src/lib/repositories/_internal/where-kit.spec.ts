/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  allOf,
  containsText,
  equalsText,
  inTexts,
  isPresent,
  isUnset,
  isUnsetOr,
  startsWithText,
} from './where-kit';

describe('where-kit', () => {
  describe('isUnset', () => {
    it('matches both an explicit null and an absent field', () => {
      expect(isUnset('deletedOn')).toEqual({
        OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
      });
    });
  });

  describe('isUnsetOr', () => {
    it('reads an unset field as the given value: the value, null, or absent all match', () => {
      expect(isUnsetOr('reference', true)).toEqual({
        OR: [{ reference: true }, { reference: null }, { reference: { isSet: false } }],
      });
    });
  });

  describe('isPresent', () => {
    it('uses the `not: null` shape, which already excludes absent fields', () => {
      expect(isPresent('publishedAt')).toEqual({ publishedAt: { not: null } });
    });
  });

  describe('containsText', () => {
    it('matches a plain term as it is, whatever the case', () => {
      expect(containsText('bus')).toEqual({ contains: 'bus', mode: 'insensitive' });
    });

    it('escapes what a regular expression would read as syntax', () => {
      expect(containsText('a.*b(c)[d]{e}+?^$|\\').contains).toBe(
        'a\\.\\*b\\(c\\)\\[d\\]\\{e\\}\\+\\?\\^\\$\\|\\\\'
      );
    });

    it('leaves spaces, hyphens and other ordinary punctuation alone', () => {
      expect(containsText('lo-fi tape, no. 2!').contains).toBe('lo-fi tape, no\\. 2!');
    });
  });

  describe('startsWithText', () => {
    it('matches a plain prefix as it is, whatever the case', () => {
      expect(startsWithText('ad')).toEqual({ startsWith: 'ad', mode: 'insensitive' });
    });

    it('escapes what a regular expression would read as syntax', () => {
      expect(startsWithText('a.(').startsWith).toBe('a\\.\\(');
    });
  });

  describe('equalsText', () => {
    it('matches a plain value as it is, whatever the case', () => {
      expect(equalsText('Ada')).toEqual({ equals: 'Ada', mode: 'insensitive' });
    });

    it('escapes what a regular expression would read as syntax', () => {
      expect(equalsText('A.D.A (live)').equals).toBe('A\\.D\\.A \\(live\\)');
    });
  });

  describe('inTexts', () => {
    it('matches plain values as they are, whatever the case', () => {
      expect(inTexts(['ada', 'bob'])).toEqual({ in: ['ada', 'bob'], mode: 'insensitive' });
    });

    it('escapes each value', () => {
      expect(inTexts(['a.b', 'c*']).in).toEqual(['a\\.b', 'c\\*']);
    });

    it('returns a new list, leaving the one it was given alone', () => {
      const given = ['a.b'];

      inTexts(given);

      expect(given).toEqual(['a.b']);
    });
  });

  describe('allOf', () => {
    it('wraps several clauses as AND members so their OR keys never collide', () => {
      expect(allOf(isUnset('deletedOn'), isUnset('publishedOn'))).toEqual({
        AND: [
          { OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }] },
          { OR: [{ publishedOn: null }, { publishedOn: { isSet: false } }] },
        ],
      });
    });

    it('returns a fresh object each call so callers can spread without aliasing', () => {
      const first = allOf(isPresent('publishedAt'));
      const second = allOf(isPresent('publishedAt'));

      expect(first).not.toBe(second);
      expect(first.AND).not.toBe(second.AND);
    });
  });
});
