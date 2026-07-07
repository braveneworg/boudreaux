/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createBioLinkInputSchema } from './bio-link-input-schema';

const validCreate = {
  artistId: '507f1f77bcf86cd799439011',
  label: 'Official site',
  url: 'https://example.com',
};

describe('createBioLinkInputSchema', () => {
  it('accepts a minimal valid input (kind absent)', () => {
    expect(createBioLinkInputSchema.safeParse(validCreate).success).toBe(true);
  });

  it('accepts input with a known kind', () => {
    expect(createBioLinkInputSchema.safeParse({ ...validCreate, kind: 'official' }).success).toBe(
      true
    );
  });

  it('rejects a javascript: url', () => {
    expect(
      createBioLinkInputSchema.safeParse({ ...validCreate, url: 'javascript:alert(1)' }).success
    ).toBe(false);
  });

  it('rejects a data: url', () => {
    expect(
      createBioLinkInputSchema.safeParse({ ...validCreate, url: 'data:text/html,x' }).success
    ).toBe(false);
  });

  it('rejects an empty label', () => {
    expect(createBioLinkInputSchema.safeParse({ ...validCreate, label: '' }).success).toBe(false);
  });

  it('rejects a whitespace-only label', () => {
    expect(createBioLinkInputSchema.safeParse({ ...validCreate, label: '   ' }).success).toBe(
      false
    );
  });

  it('rejects a label longer than 200 characters', () => {
    expect(
      createBioLinkInputSchema.safeParse({ ...validCreate, label: 'a'.repeat(201) }).success
    ).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(createBioLinkInputSchema.safeParse({ ...validCreate, kind: 'bogus' }).success).toBe(
      false
    );
  });

  it('rejects a non-ObjectId artistId', () => {
    expect(createBioLinkInputSchema.safeParse({ ...validCreate, artistId: 'nope' }).success).toBe(
      false
    );
  });

  it('trims the label on parse', () => {
    const parsed = createBioLinkInputSchema.parse({ ...validCreate, label: '  Site  ' });
    expect(parsed.label).toBe('Site');
  });
});
