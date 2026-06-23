/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { cleanImageUrl, formatFieldDate, readField, toFieldLabel } from './data-view-utils';

describe('cleanImageUrl', () => {
  it('returns an empty string unchanged', () => {
    expect(cleanImageUrl('')).toBe('');
  });

  it('collapses a duplicated https protocol', () => {
    expect(cleanImageUrl('https://https://cdn.example.com/a.jpg')).toBe(
      'https://cdn.example.com/a.jpg'
    );
  });

  it('collapses a mixed http/https duplicate protocol', () => {
    expect(cleanImageUrl('http://https://cdn.example.com/a.jpg')).toBe(
      'https://cdn.example.com/a.jpg'
    );
  });

  it('leaves a well-formed URL untouched', () => {
    expect(cleanImageUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
  });
});

describe('readField', () => {
  it('reads a present field', () => {
    expect(readField({ title: 'Hello' }, 'title')).toBe('Hello');
  });

  it('returns undefined for an absent field', () => {
    expect(readField({ title: 'Hello' }, 'missing')).toBeUndefined();
  });

  it('does not read inherited prototype properties', () => {
    expect(readField({ title: 'Hello' }, 'toString')).toBeUndefined();
  });
});

describe('toFieldLabel', () => {
  it('splits camelCase into spaced title-case', () => {
    expect(toFieldLabel('publishedOn')).toBe('Published On');
  });

  it('title-cases a single-word field', () => {
    expect(toFieldLabel('title')).toBe('Title');
  });
});

describe('formatFieldDate', () => {
  it('returns a dash for null', () => {
    expect(formatFieldDate(null)).toBe('-');
  });

  it('returns a dash for undefined', () => {
    expect(formatFieldDate(undefined)).toBe('-');
  });

  it('formats a date string as a locale date', () => {
    expect(formatFieldDate('2024-01-15T00:00:00.000Z')).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });
});
