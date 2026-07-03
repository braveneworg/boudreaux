/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { twMergeZine } from './zine-tw-merge';

describe('twMergeZine', () => {
  describe('zine shadow utilities in the box-shadow group', () => {
    it('lets shadow-none override shadow-zine', () => {
      expect(twMergeZine('shadow-zine', 'shadow-none')).toBe('shadow-none');
    });

    it('lets shadow-none override shadow-zine-md', () => {
      expect(twMergeZine('shadow-zine-md', 'shadow-none')).toBe('shadow-none');
    });

    it('lets shadow-none override shadow-zine-sm', () => {
      expect(twMergeZine('shadow-zine-sm', 'shadow-none')).toBe('shadow-none');
    });

    it('lets shadow-none override shadow-zine-ink', () => {
      expect(twMergeZine('shadow-zine-ink', 'shadow-none')).toBe('shadow-none');
    });

    it('resolves conflicting zine shadows to the later class', () => {
      expect(twMergeZine('shadow-zine-ink', 'shadow-zine')).toBe('shadow-zine');
    });

    it('lets a zine size override another zine shadow', () => {
      expect(twMergeZine('shadow-zine', 'shadow-zine-sm')).toBe('shadow-zine-sm');
    });

    it('lets shadow-zine-ink override shadow-zine-sm', () => {
      expect(twMergeZine('shadow-zine-sm', 'shadow-zine-ink')).toBe('shadow-zine-ink');
    });

    it('lets a zine shadow override a default Tailwind shadow', () => {
      expect(twMergeZine('shadow-lg', 'shadow-zine')).toBe('shadow-zine');
    });

    it('lets a default Tailwind shadow override a zine shadow', () => {
      expect(twMergeZine('shadow-zine', 'shadow-lg')).toBe('shadow-lg');
    });

    it('merges zine shadows within the same modifier', () => {
      expect(twMergeZine('hover:shadow-zine', 'hover:shadow-none')).toBe('hover:shadow-none');
    });

    it('keeps zine shadows with different modifiers', () => {
      expect(twMergeZine('shadow-zine', 'hover:shadow-none')).toBe('shadow-zine hover:shadow-none');
    });
  });

  describe('default merge behavior is preserved', () => {
    it('still resolves default Tailwind conflicts', () => {
      expect(twMergeZine('p-2', 'p-4')).toBe('p-4');
    });

    it('keeps non-conflicting classes', () => {
      expect(twMergeZine('rounded-none', 'border-2')).toBe('rounded-none border-2');
    });

    it('keeps a zine shadow alongside unrelated classes', () => {
      expect(twMergeZine('shadow-zine', 'rounded-none')).toBe('shadow-zine rounded-none');
    });
  });
});
