/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ExtractedAudioMetadata, ExtractedTrackMetadata } from './types';

/**
 * Extract album-level audio metadata from an MP3 (or similar) file using
 * music-metadata. Best-effort: any error is swallowed and an empty object
 * is returned.
 */
export async function extractAudioMetadata(file: File): Promise<ExtractedAudioMetadata> {
  const out: ExtractedAudioMetadata = {};
  try {
    const { parseBlob } = await import('music-metadata');
    const parsedMeta = await parseBlob(file);
    const { common } = parsedMeta;
    if (common.album) out.album = common.album;
    if (common.artist) out.artist = common.artist;
    if (common.albumartist) out.albumArtist = common.albumartist;
    if (common.year) out.year = common.year;
    if (common.label?.[0]) out.label = common.label[0];
    if (common.picture && common.picture.length > 0) {
      const pic = common.picture[0];
      const base64 = btoa(
        pic.data.reduce((acc: string, byte: number) => acc + String.fromCharCode(byte), '')
      );
      out.coverArt = `data:${pic.format};base64,${base64}`;
    }
  } catch {
    // Best-effort: not all formats expose ID3-style metadata.
  }
  return out;
}

/**
 * Extract per-track metadata (title, duration) from an audio file. Best-effort.
 */
export async function extractTrackMetadata(file: File): Promise<ExtractedTrackMetadata> {
  try {
    const { parseBlob } = await import('music-metadata');
    const parsedTrack = await parseBlob(file);
    return {
      title: parsedTrack.common.title,
      duration: parsedTrack.format.duration ? Math.round(parsedTrack.format.duration) : undefined,
    };
  } catch {
    return {};
  }
}
