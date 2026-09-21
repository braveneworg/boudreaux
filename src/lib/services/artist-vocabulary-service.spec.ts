/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ArtistVocabularyService, VOCABULARY_TAKE } from './artist-vocabulary-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/artist-repository', () => ({
  ArtistRepository: { listVocabularySource: vi.fn() },
}));

const { ArtistRepository } = await import('@/lib/repositories/artist-repository');
const listSource = vi.mocked(ArtistRepository.listVocabularySource);

const values = (entries: { value: string }[]): string[] => entries.map((entry) => entry.value);

beforeEach(() => {
  ArtistVocabularyService.invalidate();
  listSource.mockResolvedValue([]);
});

describe('ArtistVocabularyService.search', () => {
  it('groups terms that differ only by case into one entry', async () => {
    listSource.mockResolvedValue(['Experimental, Electronic', 'experimental', 'EXPERIMENTAL']);

    const results = await ArtistVocabularyService.search('genres', '');

    expect(results).toContainEqual({ value: 'experimental', count: 3 });
  });

  it('counts a value repeated within one artist row only once', async () => {
    listSource.mockResolvedValue(['Punk, punk', 'punk']);

    const results = await ArtistVocabularyService.search('genres', '');

    expect(results).toContainEqual({ value: 'punk', count: 2 });
  });

  it('returns the normalised term as the value', async () => {
    listSource.mockResolvedValue(['Indie Rock']);

    const results = await ArtistVocabularyService.search('genres', '');

    expect(values(results)).toEqual(['indie-rock']);
  });

  it('returns the top entries for an empty query', async () => {
    listSource.mockResolvedValue(['noise,drone', 'noise', 'noise', 'drone']);

    const results = await ArtistVocabularyService.search('genres', '');

    expect(values(results)).toEqual(['noise', 'drone']);
  });

  it('ranks by usage count descending', async () => {
    listSource.mockResolvedValue(['rare', 'common', 'common', 'common']);

    const results = await ArtistVocabularyService.search('genres', '');

    expect(values(results)).toEqual(['common', 'rare']);
  });

  it('breaks a count tie alphabetically for a deterministic order', async () => {
    listSource.mockResolvedValue(['zydeco', 'ambient', 'mambo']);

    const results = await ArtistVocabularyService.search('genres', '');

    expect(values(results)).toEqual(['ambient', 'mambo', 'zydeco']);
  });

  it('filters on a substring of the normalised term', async () => {
    listSource.mockResolvedValue(['indie-rock,indie-pop,noise']);

    const results = await ArtistVocabularyService.search('genres', 'indie');

    expect(values(results)).toEqual(['indie-pop', 'indie-rock']);
  });

  it('normalises the query before matching, so spaced input finds a dashed term', async () => {
    listSource.mockResolvedValue(['hip-hop']);

    const results = await ArtistVocabularyService.search('genres', 'Hip Hop');

    expect(values(results)).toEqual(['hip-hop']);
  });

  it('returns nothing when the query matches no term', async () => {
    listSource.mockResolvedValue(['noise']);

    const results = await ArtistVocabularyService.search('genres', 'polka');

    expect(results).toEqual([]);
  });

  it('caps the results at VOCABULARY_TAKE', async () => {
    listSource.mockResolvedValue([
      Array.from({ length: VOCABULARY_TAKE + 5 }, (_unused, index) => `genre-${index}`).join(','),
    ]);

    const results = await ArtistVocabularyService.search('genres', '');

    expect(results).toHaveLength(VOCABULARY_TAKE);
  });

  it('drops terms that normalise to nothing', async () => {
    listSource.mockResolvedValue(['!!!, noise']);

    const results = await ArtistVocabularyService.search('genres', '');

    expect(values(results)).toEqual(['noise']);
  });
});

describe('ArtistVocabularyService caching', () => {
  it('does not re-read the repository within the TTL', async () => {
    listSource.mockResolvedValue(['noise']);

    await ArtistVocabularyService.search('genres', '');
    await ArtistVocabularyService.search('genres', 'noi');

    expect(listSource).toHaveBeenCalledTimes(1);
  });

  it('caches genres and tags independently', async () => {
    listSource.mockResolvedValue(['noise']);

    await ArtistVocabularyService.search('genres', '');
    await ArtistVocabularyService.search('tags', '');

    expect(listSource).toHaveBeenCalledTimes(2);
    expect(listSource).toHaveBeenNthCalledWith(1, 'genres');
    expect(listSource).toHaveBeenNthCalledWith(2, 'tags');
  });

  it('re-reads after invalidate for that field', async () => {
    listSource.mockResolvedValue(['noise']);

    await ArtistVocabularyService.search('genres', '');
    ArtistVocabularyService.invalidate('genres');
    await ArtistVocabularyService.search('genres', '');

    expect(listSource).toHaveBeenCalledTimes(2);
  });

  it('leaves the other field cached when invalidating one', async () => {
    listSource.mockResolvedValue(['noise']);

    await ArtistVocabularyService.search('genres', '');
    await ArtistVocabularyService.search('tags', '');
    ArtistVocabularyService.invalidate('genres');
    await ArtistVocabularyService.search('tags', '');

    expect(listSource).toHaveBeenCalledTimes(2);
  });

  it('clears every field when invalidate is called with no field', async () => {
    listSource.mockResolvedValue(['noise']);

    await ArtistVocabularyService.search('genres', '');
    await ArtistVocabularyService.search('tags', '');
    ArtistVocabularyService.invalidate();
    await ArtistVocabularyService.search('genres', '');
    await ArtistVocabularyService.search('tags', '');

    expect(listSource).toHaveBeenCalledTimes(4);
  });

  // TTL EXPIRY IS DELIBERATELY NOT UNIT-TESTED. lru-cache captures the global
  // `performance` object when the cache is constructed, at module load; vitest's
  // fake timers replace that global afterwards and `vi.resetModules()` does not
  // reset an externalized node_modules dep, so the cache keeps reading the real
  // clock. A frozen-clock test here passes whatever the TTL is set to — it
  // cannot fail, which is worse than no test. What is ours is the cache wiring
  // and `invalidate()`, covered above; the expiry itself is lru-cache's.
});
