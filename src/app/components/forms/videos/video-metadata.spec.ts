/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import {
  POSTER_SAMPLE_END_SECONDS,
  POSTER_SAMPLE_START_SECONDS,
  captureVideoPoster,
  extractVideoDuration,
  extractVideoTags,
  posterCandidateTimes,
  scoreFrameQuality,
} from './video-metadata';

const parseBlobMock = vi.fn();

vi.mock('music-metadata', () => ({
  parseBlob: (...args: unknown[]) => parseBlobMock(...args),
}));

const getContextMock = vi.fn();
const toBlobMock = vi.fn();
const drawImageMock = vi.fn();
const getImageDataMock = vi.fn();
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

const posterBlob = new Blob(['poster'], { type: 'image/jpeg' });

const videoFile = (name = 'clip.mp4'): File =>
  new File(['video-bytes'], name, { type: 'video/mp4' });

/** Override a read-only media metric jsdom never populates. */
const defineNumber = (element: HTMLVideoElement, prop: string, value: number): void => {
  Object.defineProperty(element, prop, { configurable: true, value });
};

/** Make `currentTime` read/write (jsdom leaves it unimplemented) and record every seek. */
const installCurrentTime = (video: HTMLVideoElement): number[] => {
  const seeks: number[] = [];
  let currentTime = 0;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
      seeks.push(value);
    },
  });
  return seeks;
};

/**
 * Spy on `document.createElement` so the detached video element the util builds
 * can be captured, then driven with dispatched media events. Real elements are
 * returned so they remain genuine DOM nodes.
 */
const createdCanvases: HTMLCanvasElement[] = [];

const setupDom = (): (() => HTMLVideoElement) => {
  let video: HTMLVideoElement | null = null;
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = realCreateElement(tagName);
    if (tagName === 'video') {
      video = element as HTMLVideoElement;
    }
    if (tagName === 'canvas') {
      createdCanvases.push(element as HTMLCanvasElement);
    }
    return element;
  });

  return () => {
    if (!video) {
      throw new Error('expected a video element to be created');
    }
    return video;
  };
};

interface PosterOptions {
  atSeconds?: number;
  duration?: number;
  width?: number;
  height?: number;
}

/** Start a poster capture and prime the captured video's metrics. */
const startPoster = ({ atSeconds, duration = 10, width = 320, height = 240 }: PosterOptions = {}): {
  promise: Promise<Blob | null>;
  video: HTMLVideoElement;
  seeks: number[];
} => {
  const getVideo = setupDom();
  const promise = captureVideoPoster(videoFile(), atSeconds);
  const video = getVideo();
  defineNumber(video, 'videoWidth', width);
  defineNumber(video, 'videoHeight', height);
  defineNumber(video, 'duration', duration);
  const seeks = installCurrentTime(video);
  return { promise, video, seeks };
};

/** Fire `count` seeked events — one per sampled candidate frame. */
const dispatchSeeks = (video: HTMLVideoElement, count: number): void => {
  Array.from({ length: count }).forEach(() => video.dispatchEvent(new Event('seeked')));
};

/** Build an ImageData whose pixels are gray levels from a luma array. */
const sampleFromLuma = ({
  luma,
  width,
  height,
}: {
  luma: number[];
  width: number;
  height: number;
}): ImageData =>
  ({
    data: new Uint8ClampedArray(luma.flatMap((level) => [level, level, level, 255])),
    width,
    height,
  }) as unknown as ImageData;

/** A flat mid-gray frame — the lowest-quality candidate (score 0). */
const flatSample = (): ImageData =>
  sampleFromLuma({ luma: Array.from({ length: 16 }, () => 128), width: 4, height: 4 });

/** A 4×4 checkerboard — maximal neighbor contrast, the sharpest candidate. */
const checkerSample = (): ImageData =>
  sampleFromLuma({
    luma: Array.from({ length: 16 }, (_, i) => ((i + Math.floor(i / 4)) % 2 === 0 ? 0 : 255)),
    width: 4,
    height: 4,
  });

beforeEach(() => {
  createdCanvases.length = 0;
  parseBlobMock.mockReset();
  drawImageMock.mockReset();
  getImageDataMock.mockReset().mockImplementation(() => flatSample());
  getContextMock.mockReset().mockReturnValue({
    drawImage: drawImageMock,
    getImageData: getImageDataMock,
  } as unknown as CanvasRenderingContext2D);
  toBlobMock.mockReset().mockImplementation((callback: BlobCallback) => callback(posterBlob));
  HTMLCanvasElement.prototype.getContext =
    getContextMock as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = toBlobMock as typeof HTMLCanvasElement.prototype.toBlob;
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  HTMLCanvasElement.prototype.toBlob = originalToBlob;
  vi.restoreAllMocks();
});

describe('extractVideoDuration', () => {
  it('resolves the rounded duration', async () => {
    const getVideo = setupDom();
    const promise = extractVideoDuration(videoFile());
    const video = getVideo();
    defineNumber(video, 'duration', 125.6);
    video.dispatchEvent(new Event('loadedmetadata'));
    await expect(promise).resolves.toBe(126);
  });

  it('resolves undefined for a NaN duration', async () => {
    const getVideo = setupDom();
    const promise = extractVideoDuration(videoFile());
    const video = getVideo();
    defineNumber(video, 'duration', NaN);
    video.dispatchEvent(new Event('loadedmetadata'));
    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves undefined for an infinite duration', async () => {
    const getVideo = setupDom();
    const promise = extractVideoDuration(videoFile());
    const video = getVideo();
    defineNumber(video, 'duration', Infinity);
    video.dispatchEvent(new Event('loadedmetadata'));
    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves undefined on a media error event', async () => {
    const getVideo = setupDom();
    const promise = extractVideoDuration(videoFile());
    getVideo().dispatchEvent(new Event('error'));
    await expect(promise).resolves.toBeUndefined();
  });

  it('revokes the object URL on the success path', async () => {
    const getVideo = setupDom();
    const promise = extractVideoDuration(videoFile());
    const video = getVideo();
    defineNumber(video, 'duration', 30);
    video.dispatchEvent(new Event('loadedmetadata'));
    await promise;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('revokes the object URL on a non-finite duration', async () => {
    const getVideo = setupDom();
    const promise = extractVideoDuration(videoFile());
    const video = getVideo();
    defineNumber(video, 'duration', NaN);
    video.dispatchEvent(new Event('loadedmetadata'));
    await promise;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('revokes the object URL on a media error', async () => {
    const getVideo = setupDom();
    const promise = extractVideoDuration(videoFile());
    getVideo().dispatchEvent(new Event('error'));
    await promise;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('extractVideoTags', () => {
  it('maps title, artist, and an ISO release date', async () => {
    parseBlobMock.mockResolvedValue({
      common: { title: 'Live at the Venue', artist: 'The Band', date: '2024-03-15' },
    });
    await expect(extractVideoTags(videoFile('clip.mp4'))).resolves.toEqual({
      title: 'Live at the Venue',
      artist: 'The Band',
      releasedOn: '2024-03-15',
    });
  });

  it('falls back to the year as a January 1st date', async () => {
    parseBlobMock.mockResolvedValue({ common: { title: 'Session', year: 2019 } });
    await expect(extractVideoTags(videoFile('clip.mp4'))).resolves.toEqual({
      title: 'Session',
      releasedOn: '2019-01-01',
    });
  });

  it('omits releasedOn for an invalid date with no year', async () => {
    parseBlobMock.mockResolvedValue({ common: { title: 'Session', date: 'not-a-date' } });
    await expect(extractVideoTags(videoFile('clip.mp4'))).resolves.toEqual({ title: 'Session' });
  });

  it('derives the title from the filename when tags have none', async () => {
    parseBlobMock.mockResolvedValue({ common: {} });
    await expect(extractVideoTags(videoFile('My.Cool_video-file.mp4'))).resolves.toEqual({
      title: 'My Cool video file',
    });
  });

  it('derives the title from the filename when parsing throws', async () => {
    parseBlobMock.mockRejectedValue(new Error('unparseable'));
    await expect(extractVideoTags(videoFile('My.Cool_video-file.mp4'))).resolves.toEqual({
      title: 'My Cool video file',
    });
  });

  it('calls parseBlob without covers or duration decoding', async () => {
    parseBlobMock.mockResolvedValue({ common: {} });
    await extractVideoTags(videoFile('clip.mp4'));
    expect(parseBlobMock).toHaveBeenCalledWith(expect.any(File), {
      skipCovers: true,
      duration: false,
    });
  });
});

describe('captureVideoPoster', () => {
  it('resolves with the captured jpeg blob on the happy path', async () => {
    const { promise, video } = startPoster();
    video.dispatchEvent(new Event('loadedmetadata'));
    dispatchSeeks(video, 5);
    await expect(promise).resolves.toBe(posterBlob);
  });

  it('resolves null when the frame canvas has no 2d context', async () => {
    // First getContext call is the render canvas — returning null there means
    // renderFrameToCanvas yields null and the capture resolves null.
    getContextMock.mockReset().mockReturnValueOnce(null);
    const { promise, video } = startPoster({ atSeconds: 1 });
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));
    await expect(promise).resolves.toBeNull();
  });

  it('scores a frame as zero when the sampler canvas has no 2d context', async () => {
    // Render canvas gets a valid context; the sampler canvas gets null, so
    // scoreCanvasQuality returns 0 but the frame is still captured.
    const validContext = {
      drawImage: drawImageMock,
      getImageData: getImageDataMock,
    } as unknown as CanvasRenderingContext2D;
    getContextMock.mockReset().mockReturnValueOnce(validContext).mockReturnValueOnce(null);
    const { promise, video } = startPoster({ atSeconds: 1 });
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));
    await expect(promise).resolves.toBe(posterBlob);
  });

  it('encodes the poster as jpeg at 0.85 quality', async () => {
    const { promise, video } = startPoster();
    video.dispatchEvent(new Event('loadedmetadata'));
    dispatchSeeks(video, 5);
    await promise;
    expect(toBlobMock).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
  });

  it('draws each frame at the native video dimensions', async () => {
    const { promise, video } = startPoster({ width: 640, height: 360 });
    video.dispatchEvent(new Event('loadedmetadata'));
    dispatchSeeks(video, 5);
    await promise;
    expect(drawImageMock).toHaveBeenCalledWith(video, 0, 0, 640, 360);
  });

  it('seeks only the explicit atSeconds when provided', async () => {
    const { promise, video, seeks } = startPoster({ atSeconds: 3 });
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));
    await promise;
    expect(seeks).toEqual([3]);
  });

  it('samples five candidate frames across the 3–10s window', async () => {
    const { promise, video, seeks } = startPoster({ duration: 245 });
    video.dispatchEvent(new Event('loadedmetadata'));
    dispatchSeeks(video, 5);
    await promise;
    // window = 10 - 3 = 7; times = 3 + (7 * (i + 0.5)) / 5 for i in 0..4
    expect(seeks).toEqual([3.7, 5.1, 6.5, 7.9, 9.3]);
  });

  it('clamps the sample window to a shorter duration', async () => {
    const { promise, video, seeks } = startPoster({ duration: 6 });
    video.dispatchEvent(new Event('loadedmetadata'));
    dispatchSeeks(video, 5);
    await promise;
    // window = 6 - 3 = 3; times = 3 + (3 * (i + 0.5)) / 5 for i in 0..4
    expect(seeks).toEqual([3.3, 3.9, 4.5, 5.1, 5.7]);
  });

  it('captures a single frame at 0 when the duration is not finite', async () => {
    const { promise, video, seeks } = startPoster({ duration: NaN });
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));
    await expect(promise).resolves.toBe(posterBlob);
    expect(seeks).toEqual([0]);
  });

  it('encodes the sharpest candidate frame, not the first', async () => {
    // Candidates 1, 2, 4, 5 sample flat gray; candidate 3 is a checkerboard.
    getImageDataMock
      .mockImplementationOnce(() => flatSample())
      .mockImplementationOnce(() => flatSample())
      .mockImplementationOnce(() => checkerSample())
      .mockImplementationOnce(() => flatSample())
      .mockImplementationOnce(() => flatSample());
    const { promise, video } = startPoster();
    video.dispatchEvent(new Event('loadedmetadata'));
    dispatchSeeks(video, 5);
    await promise;
    // Per candidate the util creates a full-res canvas then a scoring canvas,
    // so candidate 3's full-res canvas is the 5th canvas created (index 4).
    expect(toBlobMock).toHaveBeenCalledTimes(1);
    expect(toBlobMock.mock.contexts[0]).toBe(createdCanvases[4]);
  });

  it('resolves null when toBlob yields no blob', async () => {
    toBlobMock.mockImplementationOnce((callback: BlobCallback) => callback(null));
    const { promise, video } = startPoster();
    video.dispatchEvent(new Event('loadedmetadata'));
    dispatchSeeks(video, 5);
    await expect(promise).resolves.toBeNull();
  });

  it('resolves null when the 2d context is unavailable', async () => {
    getContextMock.mockReturnValueOnce(null);
    const { promise, video } = startPoster();
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));
    await expect(promise).resolves.toBeNull();
  });

  it('resolves null when rendering the frame throws', async () => {
    drawImageMock.mockImplementation(() => {
      throw new Error('draw boom');
    });
    const { promise, video } = startPoster();
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));
    await expect(promise).resolves.toBeNull();
  });

  it('revokes the object URL when rendering the frame throws', async () => {
    drawImageMock.mockImplementation(() => {
      throw new Error('draw boom');
    });
    const { promise, video } = startPoster();
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));
    await promise;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('resolves null when the video has zero dimensions', async () => {
    const { promise, video } = startPoster({ width: 0 });
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));
    await expect(promise).resolves.toBeNull();
  });

  it('resolves null on a media error event', async () => {
    const { promise, video } = startPoster();
    video.dispatchEvent(new Event('error'));
    await expect(promise).resolves.toBeNull();
  });

  it('revokes the object URL after capturing', async () => {
    const { promise, video } = startPoster();
    video.dispatchEvent(new Event('loadedmetadata'));
    dispatchSeeks(video, 5);
    await promise;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('revokes the object URL on a media error', async () => {
    const { promise, video } = startPoster();
    video.dispatchEvent(new Event('error'));
    await promise;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('posterCandidateTimes', () => {
  it('samples 5 times inside [3, 10] for long videos', () => {
    const times = posterCandidateTimes(245);
    expect(times).toHaveLength(5);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(POSTER_SAMPLE_START_SECONDS);
    expect(Math.max(...times)).toBeLessThanOrEqual(POSTER_SAMPLE_END_SECONDS);
    expect(times[0]).toBeCloseTo(3.7, 5); // 3 + (7 * 0.5) / 5
  });

  it('samples [3, duration] when the video is shorter than 10s', () => {
    const times = posterCandidateTimes(6);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...times)).toBeLessThanOrEqual(6);
  });

  it('falls back to whole-video sampling at or under 3s', () => {
    const times = posterCandidateTimes(3);
    expect(times).toHaveLength(5);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...times)).toBeLessThanOrEqual(3);
  });

  it('returns [0] for a non-finite or non-positive duration', () => {
    expect(posterCandidateTimes(Number.NaN)).toEqual([0]);
    expect(posterCandidateTimes(0)).toEqual([0]);
  });
});

describe('scoreFrameQuality', () => {
  it('scores a flat frame as 0', () => {
    expect(scoreFrameQuality(flatSample())).toBe(0);
  });

  it('scores a checkerboard above a smooth gradient', () => {
    const gradient = sampleFromLuma({
      luma: Array.from({ length: 16 }, (_, i) => i * 17),
      width: 4,
      height: 4,
    });
    expect(scoreFrameQuality(checkerSample())).toBeGreaterThan(scoreFrameQuality(gradient));
  });

  it('scores an empty frame as 0', () => {
    const empty = { data: new Uint8ClampedArray(0), width: 0, height: 0 } as unknown as ImageData;
    expect(scoreFrameQuality(empty)).toBe(0);
  });

  it('treats out-of-bounds pixel reads as zero luma', () => {
    // width/height claim a 2×2 frame (16 bytes) but data holds only one pixel,
    // so neighbor reads run off the end and each `data.at(i) ?? 0` falls back to 0.
    const truncated = {
      data: new Uint8ClampedArray([10, 20, 30, 255]),
      width: 2,
      height: 2,
    } as unknown as ImageData;
    expect(scoreFrameQuality(truncated)).toBeGreaterThanOrEqual(0);
  });
});
