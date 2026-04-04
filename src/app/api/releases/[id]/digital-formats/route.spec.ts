/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextRequest } from 'next/server';

import { GET } from './route';

vi.mock('server-only', () => ({}));

const mockFindByReleaseAndFormat = vi.fn();
const mockFindAllByRelease = vi.fn();

vi.mock('@/lib/repositories/release-digital-format-repository', () => ({
  ReleaseDigitalFormatRepository: class {
    findByReleaseAndFormat = mockFindByReleaseAndFormat;
    findAllByRelease = mockFindAllByRelease;
  },
}));

function buildRequest(searchParams: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/releases/rel-1/digital-formats');
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

function buildContext(id = 'rel-1') {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/releases/[id]/digital-formats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('without formatType (list all)', () => {
    it('returns all available formats with files', async () => {
      mockFindAllByRelease.mockResolvedValue([
        {
          formatType: 'MP3_320KBPS',
          fileName: null,
          files: [{ fileName: '01-intro.mp3' }],
        },
        {
          formatType: 'FLAC',
          fileName: 'album-flac.zip',
          files: [],
        },
      ]);

      const res = await GET(buildRequest(), buildContext());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.formats).toEqual([
        { formatType: 'MP3_320KBPS', fileName: '01-intro.mp3' },
        { formatType: 'FLAC', fileName: 'album-flac.zip' },
      ]);
    });

    it('filters out formats with no files and no fileName', async () => {
      mockFindAllByRelease.mockResolvedValue([
        { formatType: 'MP3_320KBPS', fileName: null, files: [{ fileName: 'track.mp3' }] },
        { formatType: 'WAV', fileName: null, files: [] },
      ]);

      const res = await GET(buildRequest(), buildContext());
      const body = await res.json();

      expect(body.formats).toHaveLength(1);
      expect(body.formats[0].formatType).toBe('MP3_320KBPS');
    });

    it('returns empty array when no formats exist', async () => {
      mockFindAllByRelease.mockResolvedValue([]);

      const res = await GET(buildRequest(), buildContext());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.formats).toEqual([]);
    });

    it('uses formatType.zip fallback when no fileName exists', async () => {
      mockFindAllByRelease.mockResolvedValue([{ formatType: 'FLAC', fileName: null, files: [{}] }]);

      const res = await GET(buildRequest(), buildContext());
      const body = await res.json();

      expect(body.formats[0].fileName).toBe('FLAC.zip');
    });
  });

  describe('with formatType (single lookup)', () => {
    it('returns a single format when found', async () => {
      mockFindByReleaseAndFormat.mockResolvedValue({
        formatType: 'MP3_320KBPS',
        files: [],
        totalFileSize: BigInt(1000),
      });

      const res = await GET(buildRequest({ formatType: 'MP3_320KBPS' }), buildContext());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.digitalFormat).toBeDefined();
    });

    it('returns 400 for invalid formatType', async () => {
      const res = await GET(buildRequest({ formatType: 'INVALID' }), buildContext());

      expect(res.status).toBe(400);
    });

    it('returns 404 when format not found', async () => {
      mockFindByReleaseAndFormat.mockResolvedValue(null);

      const res = await GET(buildRequest({ formatType: 'FLAC' }), buildContext());

      expect(res.status).toBe(404);
    });
  });

  describe('error handling', () => {
    it('returns 500 on unexpected error', async () => {
      mockFindAllByRelease.mockRejectedValue(new Error('DB error'));

      const res = await GET(buildRequest(), buildContext());

      expect(res.status).toBe(500);
    });
  });
});
