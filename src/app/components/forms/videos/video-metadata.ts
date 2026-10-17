/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Client-side helpers the admin video form uses to prefill metadata from a
 * selected video file and to capture a poster frame. Every helper is
 * best-effort and always resolves (never rejects), so a flaky or undecodable
 * file degrades gracefully instead of blocking the form.
 */

import { composeArtistString, splitFeaturedArtists } from '@/utils/artist-name-split';
import { parseVideoFilename } from '@/utils/parse-video-filename';

export interface ExtractedVideoTags {
  title: string;
  artist?: string;
}

/** Fold filename feat-clauses into a container artist, skipping known names. */
const supplementFeatured = (containerArtist: string, parsedFeatured: string[]): string => {
  if (parsedFeatured.length === 0) return containerArtist;
  const parts = splitFeaturedArtists(containerArtist);
  const known = new Set(parts.map((part) => part.name.toLowerCase()));
  const extras = parsedFeatured.filter((name) => !known.has(name.toLowerCase()));
  if (extras.length === 0 || parts.length === 0) return containerArtist;
  const [primary, ...featured] = parts;
  return composeArtistString(primary.name, [...featured.map((part) => part.name), ...extras]);
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
 * Extract title/artist tags from a video container. music-metadata is imported
 * lazily so the parser stays out of initial bundles. Container tags are the
 * preferred source; the file name (parsed via {@link parseVideoFilename})
 * supplies the cleaned title and artist when tags lack them, and folds in any
 * feat-clause names it finds even when the container already carries an artist.
 * A title is always guaranteed, including when parsing throws. The release date
 * is intentionally NOT extracted — the container `date` tag is usually the
 * encode/export timestamp, so the field is left to the admin or web enrichment.
 */
export const extractVideoTags = async (file: File): Promise<ExtractedVideoTags> => {
  const parsed = parseVideoFilename(file.name);
  const parsedArtist = parsed.artist
    ? composeArtistString(parsed.artist, parsed.featuredArtists)
    : undefined;
  try {
    const { parseBlob } = await import('music-metadata');
    const { common } = await parseBlob(file, { skipCovers: true, duration: false });
    const tags: ExtractedVideoTags = { title: common.title || parsed.title };
    const artist = common.artist
      ? supplementFeatured(common.artist, parsed.featuredArtists)
      : parsedArtist;
    if (artist) tags.artist = artist;
    return tags;
  } catch {
    return { title: parsed.title, ...(parsedArtist ? { artist: parsedArtist } : {}) };
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

/** How many frames one sample window yields — the "5" in "Next 5 frames". */
export const POSTER_CANDIDATE_COUNT = 5;
/** The first sample window (skips fade-ins/title cards). */
export const POSTER_SAMPLE_START_SECONDS = 3;
export const POSTER_SAMPLE_END_SECONDS = 10;
/** Every sample window is as wide as the first one. */
export const POSTER_SAMPLE_WINDOW_SECONDS = POSTER_SAMPLE_END_SECONDS - POSTER_SAMPLE_START_SECONDS;
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

/**
 * Evenly spaced sample times inside one **sample window**. Without
 * `windowStart` that is the first window — `[3s, 10s]` clamped to the
 * duration, whole-video for clips of 3s or less, `[0]` when unknowable. With
 * `windowStart` it is the window of the same width starting there, clamped to
 * the duration; `[]` when it starts at or past the end.
 */
export const posterCandidateTimes = (duration: number, windowStart?: number): number[] => {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [0];
  }
  const start =
    windowStart ?? (duration <= POSTER_SAMPLE_START_SECONDS ? 0 : POSTER_SAMPLE_START_SECONDS);
  const end = Math.min(start + POSTER_SAMPLE_WINDOW_SECONDS, duration);
  if (end <= start) {
    return [];
  }
  const sampleWindow = end - start;
  return Array.from(
    { length: POSTER_CANDIDATE_COUNT },
    (_, index) => start + (sampleWindow * (index + 0.5)) / POSTER_CANDIDATE_COUNT
  );
};

/**
 * Where the next sample window starts: the window after the one holding the
 * latest captured frame, or the first window when nothing has been captured.
 * `null` when the duration is unknown or that window would start at or past
 * the end — there are no later frames to offer.
 */
export const nextPosterWindowStart = (
  latestAtSeconds: number | null,
  duration: number | null
): number | null => {
  if (duration === null || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }
  const windowIndex =
    latestAtSeconds === null
      ? 0
      : Math.floor((latestAtSeconds - POSTER_SAMPLE_START_SECONDS) / POSTER_SAMPLE_WINDOW_SECONDS) +
        1;
  const start =
    POSTER_SAMPLE_START_SECONDS + Math.max(0, windowIndex) * POSTER_SAMPLE_WINDOW_SECONDS;
  return start < duration ? start : null;
};

/** A captured, scored poster-frame candidate. */
export interface PosterCandidate {
  /** JPEG-encoded frame. */
  blob: Blob;
  /** Timestamp the frame was sampled at. */
  atSeconds: number;
  /** `scoreFrameQuality` result — higher is sharper. */
  score: number;
}

/** Index of the highest-scoring candidate; ties go to the earliest frame. */
export const bestPosterCandidateIndex = (candidates: PosterCandidate[]): number =>
  candidates.reduce(
    (best, candidate, index) =>
      candidate.score > (candidates.at(best)?.score ?? 0) ? index : best,
    0
  );

export interface CapturePosterCandidatesArgs {
  /** The local file, or a playable URL (decoded anonymously so the canvas stays readable). */
  src: File | string;
  /** Start of the sample window; omitted means the first window. */
  windowStart?: number;
}

/**
 * Capture scored JPEG poster candidates from a video source — one per sampled
 * timestamp in the requested sample window (the first window skips fade-in
 * black frames and blur when the caller defaults to
 * `bestPosterCandidateIndex`). A File is decoded through an object URL that
 * is revoked on finish; a URL is decoded with `crossOrigin = 'anonymous'`, so
 * the CDN's CORS headers keep `drawImage` from tainting the canvas. Each frame
 * is encoded inline — render → score → `toBlob` → next seek — so at most one
 * full-resolution canvas is alive at a time. A frame that fails to render or
 * encode is skipped; an undecodable source, or a window starting past the
 * end, resolves `[]` — never rejects.
 */
export const capturePosterCandidatesFromSource = ({
  src,
  windowStart,
}: CapturePosterCandidatesArgs): Promise<PosterCandidate[]> =>
  new Promise((resolve) => {
    const isFileSource = typeof src !== 'string';
    const sourceUrl = isFileSource ? URL.createObjectURL(src) : src;
    const video = document.createElement('video');
    const candidates: PosterCandidate[] = [];
    const finish = (): void => {
      if (isFileSource) URL.revokeObjectURL(sourceUrl);
      resolve(candidates);
    };

    let times: number[] = [0];
    let index = 0;

    const seekNextOrFinish = (): void => {
      index += 1;
      const nextTime = times.at(index);
      if (nextTime === undefined) {
        finish();
        return;
      }
      video.currentTime = nextTime;
    };

    video.preload = 'metadata';
    if (!isFileSource) video.crossOrigin = 'anonymous';
    video.addEventListener('loadedmetadata', () => {
      times = posterCandidateTimes(video.duration, windowStart);
      const firstTime = times.at(0);
      if (firstTime === undefined) {
        finish();
        return;
      }
      video.currentTime = firstTime;
    });
    video.addEventListener('seeked', () => {
      const atSeconds = times.at(index) ?? 0;
      try {
        const canvas = renderFrameToCanvas(video);
        if (!canvas) {
          seekNextOrFinish();
          return;
        }
        const score = scoreCanvasQuality(canvas);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              candidates.push({ blob, atSeconds, score });
            }
            seekNextOrFinish();
          },
          'image/jpeg',
          0.85
        );
      } catch {
        // A throwing getContext/drawImage/toBlob must not strand the promise or
        // leak the object URL — skip the frame and keep the loop moving.
        seekNextOrFinish();
      }
    });
    video.addEventListener('error', () => finish());
    video.src = sourceUrl;
  });

/**
 * Capture the first sample window's poster candidates from a freshly selected
 * file — the upload-time capture. See {@link capturePosterCandidatesFromSource}.
 */
export const captureVideoPosterCandidates = (file: File): Promise<PosterCandidate[]> =>
  capturePosterCandidatesFromSource({ src: file });
