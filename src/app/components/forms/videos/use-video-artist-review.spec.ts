/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';

import { useVideoArtistReview } from './use-video-artist-review';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUseArtistNameLookupQuery = vi.fn();

vi.mock('@/hooks/use-artist-name-lookup-query', () => ({
  useArtistNameLookupQuery: (...args: unknown[]) => mockUseArtistNameLookupQuery(...args),
}));

const makeQueryResult = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  data: undefined,
  isPending: false,
  isError: false,
  isSuccess: false,
  ...overrides,
});

const MATCH_A = { id: 'a1', displayName: 'A', firstName: 'A', surname: '' };
const MATCH_B = { id: 'b2', displayName: 'B', firstName: 'B', surname: '' };

beforeEach(() => {
  vi.useFakeTimers();
  mockUseArtistNameLookupQuery.mockReturnValue(makeQueryResult());
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Test 1: debounce — lookup only called after 400ms ─────────────────────────

describe('useVideoArtistReview — debounce', () => {
  it('passes empty names until 400ms elapse, then passes parsed names', () => {
    mockUseArtistNameLookupQuery.mockReturnValue(makeQueryResult());

    const { rerender } = renderHook(({ artist }) => useVideoArtistReview(artist), {
      initialProps: { artist: '' },
    });

    // Before settling, nothing has been dispatched yet with real names
    expect(mockUseArtistNameLookupQuery).toHaveBeenLastCalledWith([]);

    rerender({ artist: 'A feat. B' });

    act(() => {
      vi.advanceTimersByTime(399);
    });

    // Timer hasn't fired — still using the old debounced value (empty string → [])
    expect(mockUseArtistNameLookupQuery).toHaveBeenLastCalledWith([]);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    // Debounce settled — parsed names now sent
    expect(mockUseArtistNameLookupQuery).toHaveBeenLastCalledWith(['A', 'B']);
  });

  it('resets the timer when artist changes mid-debounce', () => {
    const { rerender } = renderHook(({ artist }) => useVideoArtistReview(artist), {
      initialProps: { artist: '' },
    });

    rerender({ artist: 'A feat. B' });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Change before debounce fires
    rerender({ artist: 'X feat. Y' });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Still hasn't settled (400ms needed from last change)
    expect(mockUseArtistNameLookupQuery).toHaveBeenLastCalledWith([]);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockUseArtistNameLookupQuery).toHaveBeenLastCalledWith(['X', 'Y']);
  });
});

// ── Test 2: matched name entry ─────────────────────────────────────────────────

describe('useVideoArtistReview — matched entry', () => {
  it('returns status:matched with match object and draft:null, preserving role', () => {
    mockUseArtistNameLookupQuery.mockReturnValue(
      makeQueryResult({
        isSuccess: true,
        data: {
          results: [
            { name: 'A', match: MATCH_A },
            { name: 'B', match: MATCH_B },
          ],
        },
      })
    );

    const { result } = renderHook(() => useVideoArtistReview('A feat. B'));

    act(() => {
      vi.advanceTimersByTime(400);
    });

    const { entries } = result.current;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      sourceName: 'A',
      role: 'primary',
      status: 'matched',
      match: MATCH_A,
      draft: null,
    });
    expect(entries[1]).toMatchObject({
      sourceName: 'B',
      role: 'featured',
      status: 'matched',
      match: MATCH_B,
      draft: null,
    });
  });
});

// ── Test 3: unmatched name entry ───────────────────────────────────────────────

describe('useVideoArtistReview — unmatched entry', () => {
  it('returns status:new with draft prefilled from splitArtistNameParts', () => {
    mockUseArtistNameLookupQuery.mockReturnValue(
      makeQueryResult({
        isSuccess: true,
        data: {
          results: [{ name: 'Zora Quill Brandt', match: null }],
        },
      })
    );

    const { result } = renderHook(() => useVideoArtistReview('Zora Quill Brandt'));

    act(() => {
      vi.advanceTimersByTime(400);
    });

    const [entry] = result.current.entries;
    expect(entry.status).toBe('new');
    expect(entry.match).toBeNull();
    expect(entry.draft).toMatchObject({
      firstName: 'Zora',
      middleName: 'Quill',
      surname: 'Brandt',
      displayName: 'Zora Quill Brandt',
    });
  });
});

// ── Test 4: updateDraft persists across artist changes ─────────────────────────

describe('useVideoArtistReview — updateDraft', () => {
  it('merges the patch and the draft persists when artist changes away and back', () => {
    mockUseArtistNameLookupQuery.mockReturnValue(
      makeQueryResult({
        isSuccess: true,
        data: {
          results: [{ name: 'Zora Quill Brandt', match: null }],
        },
      })
    );

    const { result, rerender } = renderHook(({ artist }) => useVideoArtistReview(artist), {
      initialProps: { artist: 'Zora Quill Brandt' },
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Patch the middleName
    act(() => {
      result.current.updateDraft('Zora Quill Brandt', { middleName: 'Q.' });
    });

    const after = result.current.entries[0];
    expect(after.draft?.middleName).toBe('Q.');
    expect(after.draft?.firstName).toBe('Zora');
    expect(after.draft?.surname).toBe('Brandt');

    // Change artist away then back
    mockUseArtistNameLookupQuery.mockReturnValue(makeQueryResult());
    rerender({ artist: '' });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Restore original artist
    mockUseArtistNameLookupQuery.mockReturnValue(
      makeQueryResult({
        isSuccess: true,
        data: {
          results: [{ name: 'Zora Quill Brandt', match: null }],
        },
      })
    );
    rerender({ artist: 'Zora Quill Brandt' });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Draft should still have the patched middleName
    expect(result.current.entries[0].draft?.middleName).toBe('Q.');
  });
});

// ── Test 5: error/loading/empty → entries:[] ───────────────────────────────────

describe('useVideoArtistReview — empty states', () => {
  it('returns empty entries when query is in error', () => {
    mockUseArtistNameLookupQuery.mockReturnValue(makeQueryResult({ isError: true }));

    const { result } = renderHook(() => useVideoArtistReview('A feat. B'));

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.entries).toHaveLength(0);
  });

  it('returns empty entries when query is loading', () => {
    mockUseArtistNameLookupQuery.mockReturnValue(makeQueryResult({ isPending: true }));

    const { result } = renderHook(() => useVideoArtistReview('A feat. B'));

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.entries).toHaveLength(0);
  });

  it('returns empty entries when artist is empty string', () => {
    mockUseArtistNameLookupQuery.mockReturnValue(makeQueryResult());

    const { result } = renderHook(() => useVideoArtistReview(''));

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.entries).toHaveLength(0);
  });
});

// ── Test 6: buildArtistDetails ─────────────────────────────────────────────────

describe('useVideoArtistReview — buildArtistDetails', () => {
  it('returns only new entries with original-casing sourceName, trimmed fields, empty fields omitted, matched absent', () => {
    mockUseArtistNameLookupQuery.mockReturnValue(
      makeQueryResult({
        isSuccess: true,
        data: {
          results: [
            { name: 'A', match: MATCH_A },
            { name: 'Zora Quill Brandt', match: null },
          ],
        },
      })
    );

    const { result } = renderHook(() => useVideoArtistReview('A feat. Zora Quill Brandt'));

    act(() => {
      vi.advanceTimersByTime(400);
    });

    const details = result.current.buildArtistDetails();
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      sourceName: 'Zora Quill Brandt',
      firstName: 'Zora',
      middleName: 'Quill',
      surname: 'Brandt',
      displayName: 'Zora Quill Brandt',
    });
  });

  it('omits draft fields that trim to empty string', () => {
    mockUseArtistNameLookupQuery.mockReturnValue(
      makeQueryResult({
        isSuccess: true,
        data: {
          results: [{ name: 'Mononym', match: null }],
        },
      })
    );

    const { result } = renderHook(() => useVideoArtistReview('Mononym'));

    act(() => {
      vi.advanceTimersByTime(400);
    });

    const details = result.current.buildArtistDetails();
    expect(details[0]).toMatchObject({ sourceName: 'Mononym', firstName: 'Mononym' });
    expect(details[0]).not.toHaveProperty('middleName');
    expect(details[0]).not.toHaveProperty('surname');
  });
});

// ── Test 7: cap at 20 entries ──────────────────────────────────────────────────

describe('useVideoArtistReview — 20-entry cap', () => {
  it('caps buildArtistDetails at 20 entries even with 21 new artists', () => {
    // Simulate 21 unmatched artists via the query response
    const results = Array.from({ length: 21 }, (_, i) => ({
      name: `Artist${i + 1}`,
      match: null,
    }));

    mockUseArtistNameLookupQuery.mockReturnValue(
      makeQueryResult({
        isSuccess: true,
        data: { results },
      })
    );

    // We need to produce 21 parts from the artist string; use splitFeaturedArtists
    // indirectly — we control the mock response, but the hook derives entries from
    // the debounced parts. Feed an artist string and override the lookup response.
    // The hook calls splitFeaturedArtists on the debounced artist string, then
    // matches by position. We need 21 parts → use the mock to return 21 results.
    // To get 21 parts, produce a string "Artist1 feat. Artist2 feat. ... Artist21"
    // but splitFeaturedArtists only splits on feat./ft./featuring tokens.
    // Simplest: supply an artist string that yields exactly 21 parts.
    const artistStr =
      'Artist1 feat. Artist2 feat. Artist3 feat. Artist4 feat. Artist5 feat. Artist6 feat. Artist7 feat. Artist8 feat. Artist9 feat. Artist10 feat. Artist11 feat. Artist12 feat. Artist13 feat. Artist14 feat. Artist15 feat. Artist16 feat. Artist17 feat. Artist18 feat. Artist19 feat. Artist20 feat. Artist21';

    const { result } = renderHook(() => useVideoArtistReview(artistStr));

    act(() => {
      vi.advanceTimersByTime(400);
    });

    const details = result.current.buildArtistDetails();
    expect(details).toHaveLength(20);
  });
});
