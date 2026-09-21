/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { keepPreviousData } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { ResponseValidationError } from '@/utils/fetch-and-parse';

import { useArtistVocabularyQuery } from './use-artist-vocabulary-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const vocabularyResponse = {
  results: [
    { value: 'indie-rock', count: 7 },
    { value: 'noise', count: 2 },
  ],
};

interface CapturedOptions {
  enabled?: boolean;
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
  placeholderData: unknown;
  staleTime?: number;
}

const lastOptions = (): CapturedOptions => mockUseQuery.mock.calls[0]?.[0] as CapturedOptions;

describe('useArtistVocabularyQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: vocabularyResponse.results,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stays enabled on an empty query — the inverse of the producer hook', () => {
    renderHook(() => useArtistVocabularyQuery('genres', ''));

    expect(lastOptions().enabled).toBeUndefined();
  });

  it('normalizes the query into the key', () => {
    renderHook(() => useArtistVocabularyQuery('genres', '  Indie  '));

    expect(lastOptions().queryKey).toEqual(['artists', 'vocabulary', 'genres', 'indie']);
  });

  it('keys genres and tags distinctly', () => {
    renderHook(() => useArtistVocabularyQuery('tags', 'indie'));

    expect(lastOptions().queryKey).toEqual(['artists', 'vocabulary', 'tags', 'indie']);
  });

  it('keeps previous data', () => {
    renderHook(() => useArtistVocabularyQuery('genres', 'indie'));

    expect(lastOptions().placeholderData).toBe(keepPreviousData);
  });

  it('fetches the encoded vocabulary URL with the forwarded signal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => vocabularyResponse })
    );

    renderHook(() => useArtistVocabularyQuery('genres', 'indie rock'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).resolves.toEqual(vocabularyResponse.results);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/artists/vocabulary?field=genres&q=indie%20rock',
      { signal }
    );
  });

  it('throws when the vocabulary request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => useArtistVocabularyQuery('genres', 'indie'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toThrow(
      'Failed to load genre suggestions'
    );
  });

  it('names the tags field in its failure message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => useArtistVocabularyQuery('tags', 'indie'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toThrow(
      'Failed to load tag suggestions'
    );
  });

  it('surfaces a ResponseValidationError for a malformed body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ value: 'indie-rock' }] }),
      })
    );

    renderHook(() => useArtistVocabularyQuery('genres', 'indie'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toBeInstanceOf(ResponseValidationError);
  });

  it('lets a caller-supplied enabled=false win', () => {
    renderHook(() => useArtistVocabularyQuery('genres', 'indie', { enabled: false }));

    expect(lastOptions().enabled).toBe(false);
  });
});
