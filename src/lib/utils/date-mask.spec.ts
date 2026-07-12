/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { maskDateInput, parseMaskedDate } from './date-mask';

describe('maskDateInput', () => {
  it('formats eight digits as mm/dd/yyyy', () => {
    expect(maskDateInput('05122023')).toBe('05/12/2023');
  });

  it('leaves a lone month digit unslashed', () => {
    expect(maskDateInput('5')).toBe('5');
  });

  it('inserts the first slash once the day starts', () => {
    expect(maskDateInput('051')).toBe('05/1');
  });

  it('inserts the second slash once the year starts', () => {
    expect(maskDateInput('05122')).toBe('05/12/2');
  });

  it('strips non-digit characters before masking', () => {
    expect(maskDateInput('aa05bb12cc2023')).toBe('05/12/2023');
  });

  it('caps input at eight digits', () => {
    expect(maskDateInput('051220239999')).toBe('05/12/2023');
  });

  it('reformats an already-slashed value idempotently', () => {
    expect(maskDateInput('05/12/2023')).toBe('05/12/2023');
  });

  it('returns empty string for empty input', () => {
    expect(maskDateInput('')).toBe('');
  });
});

describe('parseMaskedDate', () => {
  it('parses a complete valid date to local midnight', () => {
    const result = parseMaskedDate('05/12/2023');
    expect(result && [result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([
      2023, 4, 12,
    ]);
  });

  it('returns null for an incomplete date', () => {
    expect(parseMaskedDate('05/1')).toBeNull();
  });

  it('returns null for an out-of-range month', () => {
    expect(parseMaskedDate('13/45/2023')).toBeNull();
  });

  it('returns null for a calendar rollover (Feb 30)', () => {
    expect(parseMaskedDate('02/30/2023')).toBeNull();
  });

  it('returns null for a year below 1900', () => {
    expect(parseMaskedDate('05/12/1899')).toBeNull();
  });

  it('returns null for a year above 2099', () => {
    expect(parseMaskedDate('05/12/2100')).toBeNull();
  });

  it('accepts the lower year boundary', () => {
    expect(parseMaskedDate('01/01/1900')).not.toBeNull();
  });

  it('accepts the upper year boundary', () => {
    expect(parseMaskedDate('12/31/2099')).not.toBeNull();
  });
});
