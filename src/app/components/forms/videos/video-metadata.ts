/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Client-side helpers the admin video form uses to prefill metadata from a
 * selected video file and to capture a poster frame. Every helper is
 * best-effort and always resolves (never rejects), so a flaky or undecodable
 * file degrades gracefully instead of blocking the form.
 */

export interface ExtractedVideoTags {
  title: string;
  artist?: string;
  releasedOn?: string;
}

const FILE_EXTENSION = /\.[^/.]+$/;
const FILENAME_SEPARATORS = /[-_.]+/g;
const WHITESPACE = /\s+/g;

/** Derive a human title from a file name: strip extension, normalize separators. */
const deriveTitleFromFileName = (fileName: string): string =>
  fileName
    .replace(FILE_EXTENSION, '')
    .replace(FILENAME_SEPARATORS, ' ')
    .replace(WHITESPACE, ' ')
    .trim();

/** Resolve an ISO date (YYYY-MM-DD) from music-metadata's `date`/`year` fields. */
const resolveReleasedOn = (date?: string, year?: number): string | undefined => {
  if (date) {
    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  if (year) {
    return `${year}-01-01`;
  }
  return undefined;
};

/**
 * Read the container duration (seconds, rounded) from a video file. Resolves
 * `undefined` for a non-finite duration or an undecodable file — never rejects.
 */
export const extractVideoDuration = (file: File): Promise<number | undefined> =>
  new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    const cleanup = (): void => {
      URL.revokeObjectURL(objectUrl);
      video.src = '';
    };

    video.preload = 'metadata';
    video.addEventListener('loadedmetadata', () => {
      const { duration } = video;
      cleanup();
      resolve(Number.isFinite(duration) ? Math.round(duration) : undefined);
    });
    video.addEventListener('error', () => {
      cleanup();
      resolve(undefined);
    });
    video.src = objectUrl;
  });

/**
 * Extract title/artist/release-date tags from a video container. music-metadata
 * is imported lazily so the parser stays out of initial bundles. A title is
 * always guaranteed: it falls back to a filename-derived title when tags lack
 * one or parsing throws.
 */
export const extractVideoTags = async (file: File): Promise<ExtractedVideoTags> => {
  try {
    const { parseBlob } = await import('music-metadata');
    const { common } = await parseBlob(file, { skipCovers: true, duration: false });
    const tags: ExtractedVideoTags = {
      title: common.title || deriveTitleFromFileName(file.name),
    };
    if (common.artist) {
      tags.artist = common.artist;
    }
    const releasedOn = resolveReleasedOn(common.date, common.year);
    if (releasedOn) {
      tags.releasedOn = releasedOn;
    }
    return tags;
  } catch {
    return { title: deriveTitleFromFileName(file.name) };
  }
};

/** Draw the current video frame to a canvas; `null` when it cannot be rendered. */
const renderFrameToCanvas = (video: HTMLVideoElement): HTMLCanvasElement | null => {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = videoWidth;
  canvas.height = videoHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(video, 0, 0, videoWidth, videoHeight);
  return canvas;
};

/** Seconds to seek to for the poster frame; guards non-finite durations. */
const posterSeekTime = (video: HTMLVideoElement, atSeconds?: number): number =>
  atSeconds ?? (Number.isFinite(video.duration) ? Math.min(1, video.duration / 2) : 0);

/**
 * Capture a JPEG poster frame from a video file. Resolves the Blob, or `null`
 * for an unrenderable frame or undecodable file — never rejects.
 */
export const captureVideoPoster = (file: File, atSeconds?: number): Promise<Blob | null> =>
  new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    const finish = (poster: Blob | null): void => {
      URL.revokeObjectURL(objectUrl);
      resolve(poster);
    };

    video.preload = 'metadata';
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = posterSeekTime(video, atSeconds);
    });
    video.addEventListener('seeked', () => {
      try {
        const canvas = renderFrameToCanvas(video);
        if (!canvas) {
          finish(null);
          return;
        }
        canvas.toBlob(finish, 'image/jpeg', 0.85);
      } catch {
        // A throwing getContext/drawImage/toBlob must not strand the promise or
        // leak the object URL — resolve null and revoke via finish().
        finish(null);
      }
    });
    video.addEventListener('error', () => finish(null));
    video.src = objectUrl;
  });
