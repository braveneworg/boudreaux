/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ARTIST_OWN_PAGE_FIELDS, ARTIST_PRIVATE_FIELDS } from '@/lib/types/domain/artist';

import {
  artistBioValues,
  artistCreditScalar,
  artistPrivateValues,
  artistPublicScalar,
  artistScalar,
} from './schema-fixtures';
import {
  artistCreditScalarSchema,
  artistPublicScalarSchema,
  artistScalarSchema,
  formatSchema,
  platformSchema,
} from './shared-schema';

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

  // ADR-0020: the links composite rides on the scalar record, null when absent.
  it('parses a populated links composite', () => {
    const links = {
      websites: [{ label: 'Official site', url: 'https://example.com' }],
      social: [{ label: null, url: 'https://www.instagram.com/example' }],
      contact: [{ heading: 'Booking', links: [{ label: null, url: 'mailto:a@example.com' }] }],
    };

    expect(artistScalarSchema.parse({ ...artistScalar, links }).links).toEqual(links);
  });

  it('rejects a links composite missing a section', () => {
    const links = { websites: [], social: [] };

    expect(() => artistScalarSchema.parse({ ...artistScalar, links })).toThrow();
  });
});

describe('ARTIST_OWN_PAGE_FIELDS', () => {
  it('names the links beside the bio fields', () => {
    expect(ARTIST_OWN_PAGE_FIELDS).toContain('links');
  });
});

describe('artistPublicScalarSchema', () => {
  it('parses an artist scalar record carrying no private field', () => {
    expect(() => artistPublicScalarSchema.parse(artistPublicScalar)).not.toThrow();
  });

  it.each(ARTIST_PRIVATE_FIELDS)('strips the private field %s', (field) => {
    const parsed = artistPublicScalarSchema.parse({ ...artistScalar, ...artistPrivateValues });

    expect(parsed).not.toHaveProperty(field);
  });
});

describe('artistCreditScalarSchema', () => {
  const leakyArtist = { ...artistScalar, ...artistPrivateValues, ...artistBioValues };

  it('parses a nested artist carrying no private or bio field', () => {
    expect(() => artistCreditScalarSchema.parse(artistCreditScalar)).not.toThrow();
  });

  it.each(ARTIST_OWN_PAGE_FIELDS)('strips the bio field %s', (field) => {
    expect(artistCreditScalarSchema.parse(leakyArtist)).not.toHaveProperty(field);
  });

  it.each(ARTIST_PRIVATE_FIELDS)('strips the private field %s', (field) => {
    expect(artistCreditScalarSchema.parse(leakyArtist)).not.toHaveProperty(field);
  });
});
