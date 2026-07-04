/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getCoverArtImages } from './caa.js';
import { logEvent } from './lib/log.js';

vi.mock('./lib/log.js', () => ({
  logEvent: vi.fn(),
  toErrorMessage: (err: unknown) => String(err),
}));

const group = (rgMbid: string, title: string) => ({
  rgMbid,
  title,
  firstReleaseDate: '2015-04-14',
  primaryType: 'Album',
});

const caaBody = {
  images: [
    {
      front: true,
      image: 'https://archive.org/full.jpg',
      thumbnails: { '250': 'https://archive.org/250.jpg', '500': 'https://archive.org/500.jpg' },
    },
  ],
};

describe('getCoverArtImages', () => {
  it('maps front covers to bio images with kind cover and alt text', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(caaBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const images = await getCoverArtImages([group('rg-1', 'Broken Bone Ballads')], 40, fetchFn);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      url: 'https://archive.org/500.jpg',
      thumbnailUrl: 'https://archive.org/250.jpg',
      title: 'Broken Bone Ballads',
      attribution: 'Cover Art Archive',
      sourceUrl: 'https://musicbrainz.org/release-group/rg-1',
      kind: 'cover',
      alt: 'Broken Bone Ballads album cover',
      isPrimary: false,
    });
  });

  it('skips groups without cover art (404) and respects maxCovers', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValue(
        new Response(JSON.stringify(caaBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    const images = await getCoverArtImages(
      [group('rg-1', 'A'), group('rg-2', 'B'), group('rg-3', 'C')],
      1,
      fetchFn
    );
    expect(images).toHaveLength(1);
    expect(images[0].title).toBe('B');
  });

  it('returns [] when every lookup throws', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network'));
    await expect(getCoverArtImages([group('rg-1', 'A')], 40, fetchFn)).resolves.toEqual([]);
  });

  it('logs warn event when fetch rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network timeout'));
    await getCoverArtImages([group('rg-123', 'A')], 40, fetchFn);
    expect(logEvent).toHaveBeenCalledWith(
      'warn',
      'caa_lookup_failed',
      expect.objectContaining({ rgMbid: 'rg-123' })
    );
  });

  it('uses front:false image as fallback when no front:true exists', async () => {
    const onlyNonFrontBody = {
      images: [
        {
          front: false,
          image: 'https://archive.org/full.jpg',
          thumbnails: {
            '250': 'https://archive.org/250.jpg',
            '500': 'https://archive.org/500.jpg',
          },
        },
      ],
    };
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(onlyNonFrontBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const images = await getCoverArtImages([group('rg-2', 'Fallback Album')], 40, fetchFn);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      url: 'https://archive.org/500.jpg',
      thumbnailUrl: 'https://archive.org/250.jpg',
      title: 'Fallback Album',
      kind: 'cover',
    });
  });
});
