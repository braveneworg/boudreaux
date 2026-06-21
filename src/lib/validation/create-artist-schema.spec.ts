/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { artistBaseSchema, createArtistSchema } from './create-artist-schema';

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
    it('accepts a bio under 5000 visible characters even with markup overhead', () => {
      const result = createArtistSchema.safeParse({
        ...validBase,
        bio: `<p>${'a'.repeat(4999)}</p>`,
      });
      expect(result.success).toBe(true);
    });

    it('rejects a bio whose visible text exceeds 5000 characters', () => {
      const result = createArtistSchema.safeParse({
        ...validBase,
        bio: '<p>' + 'a'.repeat(5001) + '</p>',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a shortBio whose visible text exceeds 500 characters', () => {
      const result = createArtistSchema.safeParse({
        ...validBase,
        shortBio: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('accepts a shortBio at the 500 visible-character boundary', () => {
      const result = createArtistSchema.safeParse({
        ...validBase,
        shortBio: `<strong>${'a'.repeat(500)}</strong>`,
      });
      expect(result.success).toBe(true);
    });

    it('rejects an altBio whose visible text exceeds 5000 characters', () => {
      const result = createArtistSchema.safeParse({
        ...validBase,
        altBio: 'a'.repeat(5001),
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
