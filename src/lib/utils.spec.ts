/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { cn } from '@/lib/utils';

describe('utils', () => {
  describe('cn (className utility)', () => {
    it('merges class names', () => {
      expect(cn('class1', 'class2')).toBe('class1 class2');
    });

    it('handles conditional classes', () => {
      const isTrue = true;
      const isFalse = false;
      expect(cn('base-class', isTrue && 'conditional-class', isFalse && 'skipped')).toBe(
        'base-class conditional-class'
      );
    });

    it('handles undefined and null values', () => {
      expect(cn('class1', undefined, null, 'class2')).toBe('class1 class2');
    });

    it('returns an empty string for no arguments', () => {
      expect(cn()).toBe('');
    });

    describe('zine shadow merging', () => {
      it('lets shadow-none override shadow-zine', () => {
        expect(cn('shadow-zine', 'shadow-none')).toBe('shadow-none');
      });

      it('resolves conflicting zine shadows to the later class', () => {
        expect(cn('shadow-zine-ink', 'shadow-zine')).toBe('shadow-zine');
      });

      it('lets a zine size override another zine shadow', () => {
        expect(cn('shadow-zine', 'shadow-zine-sm')).toBe('shadow-zine-sm');
      });

      it('lets a zine shadow override a default Tailwind shadow', () => {
        expect(cn('shadow-lg', 'shadow-zine')).toBe('shadow-zine');
      });

      it('keeps non-conflicting classes', () => {
        expect(cn('rounded-none', 'border-2')).toBe('rounded-none border-2');
      });

      it('still resolves default Tailwind conflicts', () => {
        expect(cn('p-2', 'p-4')).toBe('p-4');
      });
    });
  });
});
