/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { attachStreamUrls } from './attach-stream-urls';

vi.mock('./sign-stream-url', () => ({
  signStreamUrl: vi.fn((s3Key: string | null | undefined) => (s3Key ? `signed:${s3Key}` : null)),
}));

describe('attachStreamUrls', () => {
  it('adds streamUrl to FeaturedArtist-shaped digitalFormat.files', () => {
    const payload: Array<{
      id: string;
      digitalFormat: { files: Array<{ id: string; s3Key: string; streamUrl?: string | null }> };
    }> = [
      {
        id: 'fa-1',
        digitalFormat: {
          files: [
            { id: 'f-1', s3Key: 'a/1.mp3' },
            { id: 'f-2', s3Key: 'a/2.mp3' },
          ],
        },
      },
    ];

    attachStreamUrls(payload);

    expect(payload[0].digitalFormat.files[0]).toMatchObject({
      s3Key: 'a/1.mp3',
      streamUrl: 'signed:a/1.mp3',
    });
    expect(payload[0].digitalFormat.files[1].streamUrl).toBe('signed:a/2.mp3');
  });

  it('adds streamUrl to Release-shaped digitalFormats[].files', () => {
    const release = {
      id: 'r-1',
      digitalFormats: [
        { formatType: 'MP3_320KBPS', files: [{ id: 'f-1', s3Key: 'r/1.mp3' }] },
        { formatType: 'FLAC', files: [{ id: 'f-2', s3Key: 'r/1.flac' }] },
      ],
    };

    attachStreamUrls(release);

    expect(release.digitalFormats[0].files[0]).toHaveProperty('streamUrl', 'signed:r/1.mp3');
    expect(release.digitalFormats[1].files[0]).toHaveProperty('streamUrl', 'signed:r/1.flac');
  });

  it('recurses through artist.releases[].release.digitalFormats[].files', () => {
    const artist: {
      id: string;
      releases: Array<{
        release: {
          digitalFormats: Array<{
            files: Array<{ id: string; s3Key: string; streamUrl?: string | null }>;
          }>;
        };
      }>;
    } = {
      id: 'a-1',
      releases: [
        {
          release: {
            digitalFormats: [{ files: [{ id: 'f-1', s3Key: 'a/r/1.mp3' }] }],
          },
        },
      ],
    };

    attachStreamUrls(artist);

    expect(artist.releases[0].release.digitalFormats[0].files[0].streamUrl).toBe(
      'signed:a/r/1.mp3'
    );
  });

  it('returns the same reference for ergonomic chaining', () => {
    const payload = { digitalFormats: [] };
    expect(attachStreamUrls(payload)).toBe(payload);
  });

  it('is idempotent — does not overwrite an existing streamUrl', () => {
    const payload = {
      digitalFormat: {
        files: [{ id: 'f-1', s3Key: 'x.mp3', streamUrl: 'pre-existing' }],
      },
    };

    attachStreamUrls(payload);

    expect(payload.digitalFormat.files[0].streamUrl).toBe('pre-existing');
  });

  it('handles null and non-object payloads safely', () => {
    expect(attachStreamUrls(null)).toBeNull();
    expect(attachStreamUrls(undefined)).toBeUndefined();
    expect(attachStreamUrls(42)).toBe(42);
  });
});
