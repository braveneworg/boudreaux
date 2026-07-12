/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { artistBaseSchema, createArtistSchema, MAX_BIO_LENGTH } from './create-artist-schema';

const validBase = {
  firstName: 'John',
  surname: 'Doe',
  slug: 'john-doe',
};

describe('createArtistSchema', () => {
  describe('identity refinement (superRefine)', () => {
    it('accepts an artist identified by firstName + surname', () => {
      const result = createArtistSchema.safeParse(validBase);
      expect(result.success).toBe(true);
    });

    it('accepts an artist identified by displayName only', () => {
      const result = createArtistSchema.safeParse({
        slug: 'the-band',
        displayName: 'The Band',
      });
      expect(result.success).toBe(true);
    });

    it('accepts an artist identified by akaNames only', () => {
      const result = createArtistSchema.safeParse({
        slug: 'aka-only',
        akaNames: 'DJ Example',
      });
      expect(result.success).toBe(true);
    });

    it('requires firstName when displayName and akaNames are empty', () => {
      const result = createArtistSchema.safeParse({ slug: 'no-first', surname: 'Doe' });
      expect(result.success).toBe(false);
    });

    it('reports a firstName issue when display/aka are blank', () => {
      const result = createArtistSchema.safeParse({ slug: 'no-first', surname: 'Doe' });
      const paths = result.success ? [] : result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('firstName');
    });

    it('requires surname when displayName and akaNames are empty', () => {
      const result = createArtistSchema.safeParse({ slug: 'no-surname', firstName: 'John' });
      expect(result.success).toBe(false);
    });

    it('reports a surname issue when display/aka are blank', () => {
      const result = createArtistSchema.safeParse({ slug: 'no-surname', firstName: 'John' });
      const paths = result.success ? [] : result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('surname');
    });

    it('reports both firstName and surname issues when all identity fields are empty', () => {
      const result = createArtistSchema.safeParse({ slug: 'empty' });
      const paths = result.success ? [] : result.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(expect.arrayContaining(['firstName', 'surname']));
    });

    it('treats whitespace-only displayName as empty and falls back to name requirement', () => {
      const result = createArtistSchema.safeParse({ slug: 'ws', displayName: '   ' });
      expect(result.success).toBe(false);
    });

    it('treats whitespace-only firstName/surname as missing', () => {
      const result = createArtistSchema.safeParse({
        slug: 'ws-names',
        firstName: '   ',
        surname: '   ',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('visibleLength bio refinements', () => {
    it('accepts a bio far larger than the old 5000 cap (generous generator output)', () => {
      const result = createArtistSchema.safeParse({
        ...validBase,
        bio: `<p>${'a'.repeat(50_000)}</p>`,
      });
      expect(result.success).toBe(true);
    });

    it('accepts a bio at the MAX_BIO_LENGTH visible-character boundary', () => {
      const result = createArtistSchema.safeParse({
        ...validBase,
        bio: `<p>${'a'.repeat(MAX_BIO_LENGTH)}</p>`,
      });
      expect(result.success).toBe(true);
    });

    it('rejects a bio whose visible text exceeds MAX_BIO_LENGTH', () => {
      const result = createArtistSchema.safeParse({
        ...validBase,
        bio: `<p>${'a'.repeat(MAX_BIO_LENGTH + 1)}</p>`,
      });
      expect(result.success).toBe(false);
    });

    it('accepts a shortBio far larger than the old 500 cap', () => {
      const result = createArtistSchema.safeParse({
        ...validBase,
        shortBio: 'a'.repeat(5_000),
      });
      expect(result.success).toBe(true);
    });

    it('rejects a shortBio whose visible text exceeds MAX_BIO_LENGTH', () => {
      const result = createArtistSchema.safeParse({
        ...validBase,
        shortBio: 'a'.repeat(MAX_BIO_LENGTH + 1),
      });
      expect(result.success).toBe(false);
    });

    it('accepts an altBio far larger than the old 5000 cap', () => {
      const result = createArtistSchema.safeParse({
        ...validBase,
        altBio: 'a'.repeat(50_000),
      });
      expect(result.success).toBe(true);
    });

    it('rejects an altBio whose visible text exceeds MAX_BIO_LENGTH', () => {
      const result = createArtistSchema.safeParse({
        ...validBase,
        altBio: 'a'.repeat(MAX_BIO_LENGTH + 1),
      });
      expect(result.success).toBe(false);
    });

    it('accepts an empty-string bio via the .or(literal) escape hatch', () => {
      const result = createArtistSchema.safeParse({ ...validBase, bio: '' });
      expect(result.success).toBe(true);
    });
  });

  describe('artistBaseSchema (no identity refinement)', () => {
    it('accepts a slug-only payload without requiring a name', () => {
      const result = artistBaseSchema.safeParse({ slug: 'slug-only' });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid slug shape', () => {
      const result = artistBaseSchema.safeParse({ slug: 'Not Valid Slug' });
      expect(result.success).toBe(false);
    });

    it('rejects a createdBy that is not a 24-char hex ObjectId', () => {
      const result = artistBaseSchema.safeParse({ slug: 'ok', createdBy: 'not-an-id' });
      expect(result.success).toBe(false);
    });

    it('accepts a valid 24-char hex createdBy', () => {
      const result = artistBaseSchema.safeParse({
        slug: 'ok',
        createdBy: 'a'.repeat(24),
      });
      expect(result.success).toBe(true);
    });
  });
});
