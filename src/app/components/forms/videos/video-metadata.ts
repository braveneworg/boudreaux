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

/** How many early frames to sample when auto-picking a poster. */
const POSTER_CANDIDATE_COUNT = 5;
/** Candidates come from the first seconds of the video (clamped to duration). */
const POSTER_SAMPLE_WINDOW_SECONDS = 3;
/** Width of the downscaled copy each candidate is scored on. */
const SCORE_SAMPLE_WIDTH = 96;

/**
 * Rate a frame's visual quality as its mean squared luma difference between
 * horizontal and vertical pixel neighbors. Flat frames (fade-in black/white)
 * score 0 and blurry frames score low, so the sharpest candidate wins.
 */
export const scoreFrameQuality = ({ data, width, height }: ImageData): number => {
  const lumaAt = (x: number, y: number): number => {
    const i = (y * width + x) * 4;
    return (
      0.299 * (data.at(i) ?? 0) + 0.587 * (data.at(i + 1) ?? 0) + 0.114 * (data.at(i + 2) ?? 0)
    );
  };
  let energy = 0;
  let edges = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const luma = lumaAt(x, y);
      if (x + 1 < width) {
        energy += (luma - lumaAt(x + 1, y)) ** 2;
        edges += 1;
      }
      if (y + 1 < height) {
        energy += (luma - lumaAt(x, y + 1)) ** 2;
        edges += 1;
      }
    }
  }
  return edges ? energy / edges : 0;
};

/** Score a captured frame on a small downscaled copy; 0 when scoring fails. */
const scoreCanvasQuality = (source: HTMLCanvasElement): number => {
  try {
    const height = Math.max(1, Math.round((SCORE_SAMPLE_WIDTH * source.height) / source.width));
    const sampler = document.createElement('canvas');
    sampler.width = SCORE_SAMPLE_WIDTH;
    sampler.height = height;
    const context = sampler.getContext('2d');
    if (!context) {
      return 0;
    }
    context.drawImage(source, 0, 0, SCORE_SAMPLE_WIDTH, height);
    return scoreFrameQuality(context.getImageData(0, 0, SCORE_SAMPLE_WIDTH, height));
  } catch {
    // Scoring is best-effort — an unscorable frame just never beats a scored one.
    return 0;
  }
};

/** Evenly spaced sample times inside the opening window; [0] when unknowable. */
const posterCandidateTimes = (duration: number): number[] => {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [0];
  }
  const window = Math.min(POSTER_SAMPLE_WINDOW_SECONDS, duration);
  return Array.from(
    { length: POSTER_CANDIDATE_COUNT },
    (_, index) => (window * (index + 0.5)) / POSTER_CANDIDATE_COUNT
  );
};

/**
 * Capture a JPEG poster frame from a video file. Without `atSeconds` it
 * samples several frames from the video's opening seconds and encodes the
 * one scoring highest on `scoreFrameQuality` (skipping fade-in black frames
 * and blur). With `atSeconds` it captures exactly that frame. Resolves the
 * Blob, or `null` for an unrenderable frame or undecodable file — never
 * rejects.
 */
export const captureVideoPoster = (file: File, atSeconds?: number): Promise<Blob | null> =>
  new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    const finish = (poster: Blob | null): void => {
      URL.revokeObjectURL(objectUrl);
      resolve(poster);
    };

    let times: number[] = [0];
    let index = 0;
    let best: { canvas: HTMLCanvasElement; score: number } | null = null;

    video.preload = 'metadata';
    video.addEventListener('loadedmetadata', () => {
      times = atSeconds === undefined ? posterCandidateTimes(video.duration) : [atSeconds];
      video.currentTime = times[0];
    });
    video.addEventListener('seeked', () => {
      try {
        const canvas = renderFrameToCanvas(video);
        if (!canvas) {
          finish(null);
          return;
        }
        const score = scoreCanvasQuality(canvas);
        if (!best || score > best.score) {
          best = { canvas, score };
        }
        index += 1;
        const nextTime = times.at(index);
        if (nextTime !== undefined) {
          video.currentTime = nextTime;
          return;
        }
        best.canvas.toBlob(finish, 'image/jpeg', 0.85);
      } catch {
        // A throwing getContext/drawImage/toBlob must not strand the promise or
        // leak the object URL — resolve null and revoke via finish().
        finish(null);
      }
    });
    video.addEventListener('error', () => finish(null));
    video.src = objectUrl;
  });
