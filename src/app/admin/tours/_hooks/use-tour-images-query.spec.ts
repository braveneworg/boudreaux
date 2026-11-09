/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';

import { useTourImagesQuery, type TourImagesOwner } from './use-tour-images-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

/** One stored image row of either model, without its owner field. */
const imageFields = {
  id: 'img-1',
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

interface OwnerCase {
  label: string;
  owner: TourImagesOwner;
  /** The same owner with each id it names blanked, one at a time. */
  missingIds: TourImagesOwner[];
  row: Record<string, unknown>;
  queryKey: unknown[];
  url: string;
  failure: string;
}

const OWNERS: OwnerCase[] = [
  {
    label: 'tour',
    owner: { kind: 'tour', tourId: 'tour-1' },
    missingIds: [{ kind: 'tour', tourId: '' }],
    row: { ...imageFields, tourId: 'tour-1' },
    queryKey: ['tours', 'images', 'tour-1'],
    url: '/api/tours/tour-1/images',
    failure: 'Failed to fetch tour images',
  },
  {
    label: 'tour date',
    owner: { kind: 'tourDate', tourId: 'tour-1', tourDateId: 'date-1' },
    missingIds: [
      { kind: 'tourDate', tourId: '', tourDateId: 'date-1' },
      { kind: 'tourDate', tourId: 'tour-1', tourDateId: '' },
    ],
    row: { ...imageFields, tourDateId: 'date-1' },
    queryKey: ['tours', 'dateImages', 'tour-1', 'date-1'],
    url: '/api/tours/tour-1/dates/date-1/images',
    failure: 'Failed to fetch tour date images',
  },
];

/** The options the hook last handed to `useQuery`. */
const lastOptions = () =>
  mockUseQuery.mock.calls.at(-1)?.[0] as {
    enabled: boolean;
    queryKey: unknown[];
    queryFn: (ctx: { signal: AbortSignal }) => Promise<{ images: unknown[] }>;
  };

describe.each(OWNERS)(
  "useTourImagesQuery for a $label's images",
  ({ owner, missingIds, row, queryKey, url, failure }) => {
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

    it('disables the query while an id it needs is missing', () => {
      const enabled = missingIds.map((missing) => {
        renderHook(() => useTourImagesQuery(missing));
        return lastOptions().enabled;
      });

      expect(enabled).toEqual(missingIds.map(() => false));
    });

    it('keeps the query disabled when the caller disables it', () => {
      renderHook(() => useTourImagesQuery(owner, { enabled: false }));

      expect(lastOptions().enabled).toBe(false);
    });

    it("uses the owner's images query key", () => {
      renderHook(() => useTourImagesQuery(owner));

      expect(lastOptions().queryKey).toEqual(queryKey);
    });

    it("fetches and parses the owner's images on a 200 response", async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ images: [row] }) })
      );
      renderHook(() => useTourImagesQuery(owner));
      const { signal } = new AbortController();

      const result = await lastOptions().queryFn({ signal });

      expect({ images: result.images.length, calls: vi.mocked(fetch).mock.calls }).toEqual({
        images: 1,
        calls: [[url, { signal }]],
      });
    });

    it('throws when the response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      renderHook(() => useTourImagesQuery(owner));
      const { signal } = new AbortController();

      await expect(lastOptions().queryFn({ signal })).rejects.toThrow(failure);
    });
  }
);
