/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { extractAudioMetadata, extractTrackMetadata } from './audio-metadata';

const parseBlobMock = vi.fn();

vi.mock('music-metadata', () => ({
  parseBlob: (...args: unknown[]) => parseBlobMock(...args),
}));

const blob = (): File => new File(['data'], 'song.mp3', { type: 'audio/mpeg' });

beforeEach(() => {
  parseBlobMock.mockReset();
});

describe('extractAudioMetadata', () => {
  it('returns parsed album, artist, year, label, and cover art when present', async () => {
    parseBlobMock.mockResolvedValue({
      common: {
        album: 'My Album',
        artist: 'Some Artist',
        albumartist: 'Album Artist',
        year: 2024,
        label: ['Label X'],
        picture: [
          {
            data: new Uint8Array([72, 105]), // "Hi"
            format: 'image/jpeg',
          },
        ],
      },
    });

    const result = await extractAudioMetadata(blob());

    expect(result.album).toBe('My Album');
    expect(result.artist).toBe('Some Artist');
    expect(result.albumArtist).toBe('Album Artist');
    expect(result.year).toBe(2024);
    expect(result.label).toBe('Label X');
    expect(result.coverArt).toBe(`data:image/jpeg;base64,${btoa('Hi')}`);
  });

  it('returns an empty object when no metadata fields are populated', async () => {
    parseBlobMock.mockResolvedValue({ common: {} });
    await expect(extractAudioMetadata(blob())).resolves.toEqual({});
  });

  it('skips cover art when picture array is empty', async () => {
    parseBlobMock.mockResolvedValue({ common: { album: 'A', picture: [] } });
    const result = await extractAudioMetadata(blob());
    expect(result.album).toBe('A');
    expect(result.coverArt).toBeUndefined();
  });

  it('returns {} on parse error', async () => {
    parseBlobMock.mockRejectedValue(new Error('boom'));
    await expect(extractAudioMetadata(blob())).resolves.toEqual({});
  });
});

describe('extractTrackMetadata', () => {
  it('returns title and rounded duration when available', async () => {
    parseBlobMock.mockResolvedValue({
      common: { title: 'Track 1' },
      format: { duration: 215.6 },
    });

    await expect(extractTrackMetadata(blob())).resolves.toEqual({
      title: 'Track 1',
      duration: 216,
    });
  });

  it('returns undefined duration when format duration is missing', async () => {
    parseBlobMock.mockResolvedValue({
      common: { title: 'Track 1' },
      format: {},
    });

    await expect(extractTrackMetadata(blob())).resolves.toEqual({
      title: 'Track 1',
      duration: undefined,
    });
  });

  it('returns {} on parse error', async () => {
    parseBlobMock.mockRejectedValue(new Error('boom'));
    await expect(extractTrackMetadata(blob())).resolves.toEqual({});
  });
});
