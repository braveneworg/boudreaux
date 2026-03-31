/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateSlug } from '@/lib/utils/generate-slug';

describe('generateSlug', () => {
  it('should slugify a single word', () => {
    expect(generateSlug('Ceschi')).toBe('ceschi');
  });

  it('should slugify a multi-word name', () => {
    expect(generateSlug('John Doe')).toBe('john-doe');
  });

  it('should handle extra whitespace', () => {
    expect(generateSlug('  John   Doe  ')).toBe('john-doe');
  });

  it('should strip special characters', () => {
    expect(generateSlug('DJ Cool & The Band!')).toBe('dj-cool-the-band');
  });

  it('should handle names with hyphens', () => {
    expect(generateSlug('Mary-Jane Watson')).toBe('mary-jane-watson');
  });

  it('should collapse consecutive dashes', () => {
    expect(generateSlug('foo---bar')).toBe('foo-bar');
  });

  it('should return empty string for empty input', () => {
    expect(generateSlug('')).toBe('');
  });

  it('should return empty string for whitespace-only input', () => {
    expect(generateSlug('   ')).toBe('');
  });

  it('should handle numeric input', () => {
    expect(generateSlug('Artist 123')).toBe('artist-123');
  });
});
