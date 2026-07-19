/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useTourDateImagesQuery } from './use-tour-date-images-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const tourDateImage = {
  id: 'img-1',
  tourDateId: 'date-1',
  s3Key: 'key',
  s3Url: 'https://example.com/img.webp',
  s3Bucket: 'bucket',
  fileName: 'img.webp',
  fileSize: 1024,
  mimeType: 'image/webp',
  displayOrder: 0,
  altText: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  uploadedBy: null,
};

describe('useTourDateImagesQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: { images: [] },
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables the query when the tour id is missing', () => {
    renderHook(() => useTourDateImagesQuery('', 'date-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as { enabled: boolean };

    expect(options.enabled).toBe(false);
  });

  it('disables the query when the tour date id is missing', () => {
    renderHook(() => useTourDateImagesQuery('tour-1', ''));

    const options = mockUseQuery.mock.calls[0]?.[0] as { enabled: boolean };

    expect(options.enabled).toBe(false);
  });

  it('uses the tour date images query key', () => {
    renderHook(() => useTourDateImagesQuery('tour-1', 'date-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as { queryKey: unknown[] };

    expect(options.queryKey).toEqual(['tours', 'dateImages', 'tour-1', 'date-1']);
  });

  it('fetches and parses the tour date images on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ images: [tourDateImage] }) })
    );

    renderHook(() => useTourDateImagesQuery('tour-1', 'date-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();
    const result = (await options.queryFn({ signal })) as { images: unknown[] };

    expect(result.images).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/tours/tour-1/dates/date-1/images', { signal });
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => useTourDateImagesQuery('tour-1', 'date-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).rejects.toThrow('Failed to fetch tour date images');
  });
});
