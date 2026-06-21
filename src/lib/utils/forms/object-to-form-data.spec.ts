/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { objectToFormData } from './object-to-form-data';

describe('object-to-form-data', () => {
  describe('null and undefined', () => {
    it('omits null values', () => {
      const formData = objectToFormData({ title: 'Hi', subtitle: null });

      expect(formData.has('subtitle')).toBe(false);
    });

    it('omits undefined values', () => {
      const formData = objectToFormData({ title: 'Hi', subtitle: undefined });

      expect(formData.has('subtitle')).toBe(false);
    });
  });

  describe('strings', () => {
    it('appends string values unchanged', () => {
      const formData = objectToFormData({ title: 'My Tour' });

      expect(formData.get('title')).toBe('My Tour');
    });

    it('omits empty strings by default', () => {
      const formData = objectToFormData({ subtitle: '' });

      expect(formData.has('subtitle')).toBe(false);
    });

    it('keeps empty strings when keepEmptyStrings is true', () => {
      const formData = objectToFormData({ subtitle: '' }, { keepEmptyStrings: true });

      expect(formData.get('subtitle')).toBe('');
    });
  });

  describe('primitives', () => {
    it('serializes numbers as strings', () => {
      const formData = objectToFormData({ position: 3 });

      expect(formData.get('position')).toBe('3');
    });

    it('serializes booleans as strings', () => {
      const formData = objectToFormData({ published: true });

      expect(formData.get('published')).toBe('true');
    });
  });

  describe('arrays', () => {
    it('JSON-stringifies array values by default', () => {
      const formData = objectToFormData({ formats: ['DIGITAL', 'VINYL'] });

      expect(formData.get('formats')).toBe('["DIGITAL","VINYL"]');
    });

    it('appends each item once for keys listed in repeatKeys', () => {
      const formData = objectToFormData({ artistIds: ['a1', 'a2'] }, { repeatKeys: ['artistIds'] });

      expect(formData.getAll('artistIds')).toEqual(['a1', 'a2']);
    });

    it('only repeat-appends the keys listed in repeatKeys', () => {
      const formData = objectToFormData(
        { artistIds: ['a1', 'a2'], formats: ['DIGITAL'] },
        { repeatKeys: ['artistIds'] }
      );

      expect(formData.get('formats')).toBe('["DIGITAL"]');
    });
  });
});
