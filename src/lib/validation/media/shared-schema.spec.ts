/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { artistScalar } from './schema-fixtures';
import { artistScalarSchema, formatSchema, platformSchema } from './shared-schema';

describe('platformSchema', () => {
  it('accepts a known platform', () => {
    expect(platformSchema.parse('SPOTIFY')).toBe('SPOTIFY');
  });

  it('rejects an unknown platform', () => {
    expect(() => platformSchema.parse('MYSPACE')).toThrow();
  });
});

describe('formatSchema', () => {
  it('accepts a known format', () => {
    expect(formatSchema.parse('VINYL')).toBe('VINYL');
  });

  it('rejects an unknown format', () => {
    expect(() => formatSchema.parse('8_TRACK')).toThrow();
  });
});

describe('artistScalarSchema', () => {
  it('parses a fully populated artist scalar record', () => {
    expect(() => artistScalarSchema.parse(artistScalar)).not.toThrow();
  });

  it('coerces an ISO date string into a Date', () => {
    expect(artistScalarSchema.parse(artistScalar).createdAt).toBeInstanceOf(Date);
  });

  it('keeps a null nullable date as null', () => {
    expect(artistScalarSchema.parse(artistScalar).diedOn).toBeNull();
  });
});
