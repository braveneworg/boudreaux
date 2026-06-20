/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getCommonsImage } from './wikimedia.js';

const commonsResponse = (imageinfo: unknown): Response =>
  new Response(
    JSON.stringify({ query: { pages: { '123': { title: 'File:Art.jpg', imageinfo } } } }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );

describe('getCommonsImage', () => {
  it('builds a displayable image with attribution and license', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      commonsResponse([
        {
          url: 'https://upload.wikimedia.org/Art.jpg',
          thumburl: 'https://upload.wikimedia.org/thumb/Art.jpg',
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Art.jpg',
          width: 1200,
          height: 800,
          extmetadata: {
            Artist: { value: '<a href="/wiki/User:Photog">Jane Photog</a>' },
            LicenseShortName: { value: 'CC BY-SA 4.0' },
          },
        },
      ])
    );

    const result = await getCommonsImage('Art.jpg', fetchFn);

    expect(result?.url).toBe('https://upload.wikimedia.org/Art.jpg');
    expect(result?.thumbnailUrl).toBe('https://upload.wikimedia.org/thumb/Art.jpg');
    expect(result?.attribution).toContain('Jane Photog');
    expect(result?.license).toBe('CC BY-SA 4.0');
    expect(result?.isPrimary).toBe(false);
  });

  it('prefixes a bare file name with File: in the request', async () => {
    const fetchFn = vi.fn().mockResolvedValue(commonsResponse([{ url: 'https://x/Art.jpg' }]));

    await getCommonsImage('Art.jpg', fetchFn);

    expect(fetchFn.mock.calls[0][0]).toContain('File%3AArt.jpg');
  });

  it('returns null when the file has no image info', async () => {
    const fetchFn = vi.fn().mockResolvedValue(commonsResponse(undefined));

    const result = await getCommonsImage('Missing.jpg', fetchFn);

    expect(result).toBeNull();
  });

  it('falls back to a generic attribution when no author metadata exists', async () => {
    const fetchFn = vi.fn().mockResolvedValue(commonsResponse([{ url: 'https://x/Art.jpg' }]));

    const result = await getCommonsImage('Art.jpg', fetchFn);

    expect(result?.attribution).toBe('Wikimedia Commons');
  });
});
