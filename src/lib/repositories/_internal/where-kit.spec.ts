/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { allOf, isPresent, isUnset, isUnsetOr } from './where-kit';

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
