/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useReleaseDetailQuery } from './use-release-detail-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

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

describe('useReleaseDetailQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables the query when no release id is provided', () => {
    renderHook(() => useReleaseDetailQuery(''));

    const options = mockUseQuery.mock.calls[0]?.[0] as { enabled: boolean };

    expect(options.enabled).toBe(false);
  });

  it('uses the admin release detail query key', () => {
    renderHook(() => useReleaseDetailQuery('release-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as { queryKey: unknown[] };

    expect(options.queryKey).toEqual(['releases', 'adminDetail', 'release-1']);
  });

  it('fetches and parses the release on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => releaseResponse })
    );

    renderHook(() => useReleaseDetailQuery('release-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();
    const result = (await options.queryFn({ signal })) as { id: string };

    expect(result.id).toBe('release-1');
    expect(global.fetch).toHaveBeenCalledWith('/api/releases/release-1', { signal });
  });

  it('returns null when the release is not found (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    renderHook(() => useReleaseDetailQuery('missing'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).resolves.toBeNull();
  });

  it('throws when the response fails for a non-404 reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    renderHook(() => useReleaseDetailQuery('release-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).rejects.toThrow('Failed to fetch release');
  });
});
