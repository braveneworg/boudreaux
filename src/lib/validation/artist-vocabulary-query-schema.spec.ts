/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ARTIST_VOCABULARY_MAX_QUERY_LENGTH,
  artistVocabularyQuerySchema,
} from './artist-vocabulary-query-schema';

describe('artistVocabularyQuerySchema', () => {
  describe('field', () => {
    it('accepts genres', () => {
      const result = artistVocabularyQuerySchema.safeParse({ field: 'genres' });

      expect(result.success).toBe(true);
    });

    it('accepts tags', () => {
      const result = artistVocabularyQuerySchema.safeParse({ field: 'tags' });

      expect(result.success).toBe(true);
    });

    it('rejects another artist column', () => {
      const result = artistVocabularyQuerySchema.safeParse({ field: 'displayName' });

      expect(result.success).toBe(false);
    });

    it('rejects a Mongo operator', () => {
      const result = artistVocabularyQuerySchema.safeParse({ field: '$where' });

      expect(result.success).toBe(false);
    });

    it('rejects a missing field rather than defaulting to genres', () => {
      const result = artistVocabularyQuerySchema.safeParse({ q: 'punk' });

      expect(result.success).toBe(false);
    });

    it('rejects a null field', () => {
      const result = artistVocabularyQuerySchema.safeParse({ field: null });

      expect(result.success).toBe(false);
    });
  });

  describe('q', () => {
    it('defaults to an empty string when absent', () => {
      const result = artistVocabularyQuerySchema.parse({ field: 'genres' });

      expect(result.q).toBe('');
    });

    it('trims surrounding whitespace', () => {
      const result = artistVocabularyQuerySchema.parse({ field: 'genres', q: '  punk  ' });

      expect(result.q).toBe('punk');
    });

    it('truncates an over-long query instead of rejecting it', () => {
      const result = artistVocabularyQuerySchema.safeParse({
        field: 'genres',
        q: 'x'.repeat(ARTIST_VOCABULARY_MAX_QUERY_LENGTH + 50),
      });

      expect(result.success).toBe(true);
    });

    it('truncates to the maximum length', () => {
      const result = artistVocabularyQuerySchema.parse({
        field: 'genres',
        q: 'x'.repeat(ARTIST_VOCABULARY_MAX_QUERY_LENGTH + 50),
      });

      expect(result.q).toHaveLength(ARTIST_VOCABULARY_MAX_QUERY_LENGTH);
    });

    it('keeps a query at exactly the maximum length', () => {
      const q = 'x'.repeat(ARTIST_VOCABULARY_MAX_QUERY_LENGTH);
      const result = artistVocabularyQuerySchema.parse({ field: 'genres', q });

      expect(result.q).toBe(q);
    });
  });
});
