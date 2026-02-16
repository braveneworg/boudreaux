/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isValidObjectId, OBJECT_ID_REGEX } from './object-id';

describe('object-id', () => {
  describe('OBJECT_ID_REGEX', () => {
    it('exports a regex pattern', () => {
      expect(OBJECT_ID_REGEX).toBeInstanceOf(RegExp);
    });

    it('matches 24-character lowercase hex strings', () => {
      expect(OBJECT_ID_REGEX.test('507f1f77bcf86cd799439011')).toBe(true);
    });

    it('matches 24-character uppercase hex strings', () => {
      expect(OBJECT_ID_REGEX.test('507F1F77BCF86CD799439011')).toBe(true);
    });

    it('matches 24-character mixed case hex strings', () => {
      expect(OBJECT_ID_REGEX.test('507f1F77BCf86cD799439011')).toBe(true);
    });

    it('rejects strings shorter than 24 characters', () => {
      expect(OBJECT_ID_REGEX.test('507f1f77bcf86cd79943901')).toBe(false);
    });

    it('rejects strings longer than 24 characters', () => {
      expect(OBJECT_ID_REGEX.test('507f1f77bcf86cd7994390111')).toBe(false);
    });

    it('rejects non-hex characters', () => {
      expect(OBJECT_ID_REGEX.test('507f1f77bcf86cd79943901g')).toBe(false);
    });

    it('rejects empty strings', () => {
      expect(OBJECT_ID_REGEX.test('')).toBe(false);
    });
  });

  describe('isValidObjectId', () => {
    it('returns true for valid lowercase ObjectId', () => {
      expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
    });

    it('returns true for valid uppercase ObjectId', () => {
      expect(isValidObjectId('507F1F77BCF86CD799439011')).toBe(true);
    });

    it('returns true for valid mixed case ObjectId', () => {
      expect(isValidObjectId('aAbBcCdDeEfF001122334455')).toBe(true);
    });

    it('returns false for too-short string', () => {
      expect(isValidObjectId('507f1f77bcf86cd79943901')).toBe(false);
    });

    it('returns false for too-long string', () => {
      expect(isValidObjectId('507f1f77bcf86cd7994390111')).toBe(false);
    });

    it('returns false for non-hex characters', () => {
      expect(isValidObjectId('507f1f77bcf86cd79943901g')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isValidObjectId('')).toBe(false);
    });

    it('returns false for string with spaces', () => {
      expect(isValidObjectId('507f 1f77bcf86cd799439011')).toBe(false);
    });

    it('returns false for string with special characters', () => {
      expect(isValidObjectId('507f1f77bcf86cd799439!1a')).toBe(false);
    });
  });
});
