/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useReleaseDetailQuery, useReleaseQuery } from './use-release-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

/** Full admin `releaseSchema` fixture for the no-`withTracks` parse path. */
const releaseResponse = {
  id: 'release-1',
  title: 'Test Release',
  labels: [],
  releasedOn: '2024-01-01T00:00:00.000Z',
  catalogNumber: null,
  coverArt: 'cover.jpg',
  description: null,
  downloadUrls: [],
  formats: [],
  extendedData: [],
  notes: [],
  executiveProducedBy: [],
  coProducedBy: [],
  masteredBy: [],
  mixedBy: [],
  recordedBy: [],
  artBy: [],
  designBy: [],
  photographyBy: [],
  linerNotesBy: [],
  imageTypes: [],
  variants: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deletedOn: null,
  publishedAt: null,
  featuredOn: null,
  featuredUntil: null,
  featuredDescription: null,
  tagId: null,
  suggestedPrice: null,
  images: [],
  artistReleases: [],
  digitalFormats: [],
  releaseUrls: [],
};

type CapturedOptions = {
  enabled: boolean;
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
};

const lastOptions = (): CapturedOptions => mockUseQuery.mock.calls[0]?.[0] as CapturedOptions;

beforeEach(() => {
  mockUseQuery.mockReturnValue({
    isPending: false,
    isError: false,
    error: undefined,
    data: null,
    refetch: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReleaseQuery (public, withTracks)', () => {
  it('disables the query when no release id is provided', () => {
    renderHook(() => useReleaseQuery(''));

    expect(lastOptions().enabled).toBe(false);
  });

  it('uses the public release detail query key', () => {
    renderHook(() => useReleaseQuery('release-1'));

    expect(lastOptions().queryKey).toEqual(['releases', 'detail', 'release-1']);
  });

  it('requests the `?withTracks=true` URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    renderHook(() => useReleaseQuery('release-1'));

    const { signal } = new AbortController();
    await expect(lastOptions().queryFn({ signal })).resolves.toBeNull();
    expect(global.fetch).toHaveBeenCalledWith('/api/releases/release-1?withTracks=true', {
      signal,
    });
  });

  it('throws when the response fails for a non-404 reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    renderHook(() => useReleaseQuery('release-1'));

    const { signal } = new AbortController();
    await expect(lastOptions().queryFn({ signal })).rejects.toThrow('Failed to fetch release');
  });
});

describe('useReleaseDetailQuery (admin, no withTracks)', () => {
  it('disables the query when no release id is provided', () => {
    renderHook(() => useReleaseDetailQuery(''));

    expect(lastOptions().enabled).toBe(false);
  });

  it('uses the admin release detail query key', () => {
    renderHook(() => useReleaseDetailQuery('release-1'));

    expect(lastOptions().queryKey).toEqual(['releases', 'adminDetail', 'release-1']);
  });

  it('fetches the no-`withTracks` URL and parses the release on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => releaseResponse })
    );

    renderHook(() => useReleaseDetailQuery('release-1'));

    const { signal } = new AbortController();
    const result = (await lastOptions().queryFn({ signal })) as { id: string };

    expect(result.id).toBe('release-1');
    expect(global.fetch).toHaveBeenCalledWith('/api/releases/release-1', { signal });
  });

  it('returns null when the release is not found (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    renderHook(() => useReleaseDetailQuery('missing'));

    const { signal } = new AbortController();
    await expect(lastOptions().queryFn({ signal })).resolves.toBeNull();
  });

  it('throws when the response fails for a non-404 reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    renderHook(() => useReleaseDetailQuery('release-1'));

    const { signal } = new AbortController();
    await expect(lastOptions().queryFn({ signal })).rejects.toThrow('Failed to fetch release');
  });
});
