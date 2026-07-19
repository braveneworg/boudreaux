/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useReleaseDigitalFormatQuery } from './use-release-digital-format-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const digitalFormatResponse = {
  digitalFormat: {
    id: 'format-1',
    releaseId: 'release-1',
    formatType: 'MP3_320KBPS',
    s3Key: null,
    fileName: null,
    fileSize: null,
    mimeType: null,
    trackCount: 1,
    totalFileSize: null,
    checksum: null,
    deletedAt: null,
    uploadedAt: '2024-01-01T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    files: [
      {
        id: 'file-1',
        formatId: 'format-1',
        trackNumber: 1,
        title: 'Track One',
        duration: null,
        s3Key: 'key',
        fileName: 'track-one.mp3',
        fileSize: '123',
        mimeType: 'audio/mpeg',
        checksum: null,
        uploadedAt: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
  },
};

describe('useReleaseDigitalFormatQuery', () => {
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

  it('disables the query when no release id is provided', () => {
    renderHook(() => useReleaseDigitalFormatQuery('', 'MP3_320KBPS'));

    const options = mockUseQuery.mock.calls[0]?.[0] as { enabled: boolean };

    expect(options.enabled).toBe(false);
  });

  it('uses the single digital-format query key', () => {
    renderHook(() => useReleaseDigitalFormatQuery('release-1', 'MP3_320KBPS'));

    const options = mockUseQuery.mock.calls[0]?.[0] as { queryKey: unknown[] };

    expect(options.queryKey).toEqual(['releases', 'digitalFormat', 'release-1', 'MP3_320KBPS']);
  });

  it('unwraps and parses the digital format on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => digitalFormatResponse })
    );

    renderHook(() => useReleaseDigitalFormatQuery('release-1', 'MP3_320KBPS'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();
    const result = (await options.queryFn({ signal })) as { id: string; files: unknown[] };

    expect(result.id).toBe('format-1');
    expect(result.files).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/releases/release-1/digital-formats?formatType=MP3_320KBPS',
      { signal }
    );
  });

  it('returns null when the format is not found (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    renderHook(() => useReleaseDigitalFormatQuery('release-1', 'MP3_320KBPS'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).resolves.toBeNull();
  });

  it('throws when the response fails for a non-404 reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    renderHook(() => useReleaseDigitalFormatQuery('release-1', 'MP3_320KBPS'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).rejects.toThrow('Failed to fetch digital format');
  });
});
