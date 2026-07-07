/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { normalizeUsPhoneToE164 } from './phone';

describe('normalizeUsPhoneToE164', () => {
  it('converts a bare 10-digit string to E.164', () => {
    expect(normalizeUsPhoneToE164('5551234567')).toBe('+15551234567');
  });

  it('converts an 11-digit string starting with 1 to E.164', () => {
    expect(normalizeUsPhoneToE164('15551234567')).toBe('+15551234567');
  });

  it('strips dashes and converts to E.164', () => {
    expect(normalizeUsPhoneToE164('1-555-123-4567')).toBe('+15551234567');
  });

  it('strips parens and spaces and converts to E.164', () => {
    expect(normalizeUsPhoneToE164('(555) 123-4567')).toBe('+15551234567');
  });

  it('passes through an already-E.164 US number unchanged', () => {
    expect(normalizeUsPhoneToE164('+15551234567')).toBe('+15551234567');
  });

  it('passes through any +-prefixed number unchanged (SNS is the arbiter)', () => {
    expect(normalizeUsPhoneToE164('+441632960961')).toBe('+441632960961');
  });

  it('strips punctuation from a +-prefixed US number', () => {
    expect(normalizeUsPhoneToE164('+1 (555) 123-4567')).toBe('+15551234567');
  });

  it('strips dashes from a +-prefixed US number', () => {
    expect(normalizeUsPhoneToE164('+1-555-123-4567')).toBe('+15551234567');
  });

  it('returns null for a lone + with no digits', () => {
    expect(normalizeUsPhoneToE164('+')).toBeNull();
  });

  it('returns null for a too-short number', () => {
    expect(normalizeUsPhoneToE164('123')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(normalizeUsPhoneToE164('not a phone')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(normalizeUsPhoneToE164('')).toBeNull();
  });

  it('returns null for 11 digits NOT starting with 1', () => {
    expect(normalizeUsPhoneToE164('25551234567')).toBeNull();
  });
});
