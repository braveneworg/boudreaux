/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { captureVideoPoster, extractVideoDuration, extractVideoTags } from './video-metadata';

const parseBlobMock = vi.fn();

vi.mock('music-metadata', () => ({
  parseBlob: (...args: unknown[]) => parseBlobMock(...args),
}));

const getContextMock = vi.fn();
const toBlobMock = vi.fn();
const drawImageMock = vi.fn();
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

const posterBlob = new Blob(['poster'], { type: 'image/jpeg' });

const videoFile = (name = 'clip.mp4'): File =>
  new File(['video-bytes'], name, { type: 'video/mp4' });

/** Override a read-only media metric jsdom never populates. */
const defineNumber = (element: HTMLVideoElement, prop: string, value: number): void => {
  Object.defineProperty(element, prop, { configurable: true, value });
};

/** Make `currentTime` a plain read/write value jsdom otherwise leaves unimplemented. */
const installCurrentTime = (video: HTMLVideoElement): void => {
  let currentTime = 0;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    },
  });
};

/**
 * Spy on `document.createElement` so the detached video element the util builds
 * can be captured, then driven with dispatched media events. Real elements are
 * returned so they remain genuine DOM nodes.
 */
const setupDom = (): (() => HTMLVideoElement) => {
  let video: HTMLVideoElement | null = null;
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = realCreateElement(tagName);
    if (tagName === 'video') {
      video = element as HTMLVideoElement;
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
} => {
  const getVideo = setupDom();
  const promise = captureVideoPoster(videoFile(), atSeconds);
  const video = getVideo();
  defineNumber(video, 'videoWidth', width);
  defineNumber(video, 'videoHeight', height);
  defineNumber(video, 'duration', duration);
  installCurrentTime(video);
  return { promise, video };
};

beforeEach(() => {
  parseBlobMock.mockReset();
  drawImageMock.mockReset();
  getContextMock
    .mockReset()
    .mockReturnValue({ drawImage: drawImageMock } as unknown as CanvasRenderingContext2D);
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
    video.dispatchEvent(new Event('seeked'));
    await expect(promise).resolves.toBe(posterBlob);
  });

  it('encodes the poster as jpeg at 0.85 quality', async () => {
    const { promise, video } = startPoster();
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));
    await promise;
    expect(toBlobMock).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
  });

  it('draws the frame at the native video dimensions', async () => {
    const { promise, video } = startPoster({ width: 640, height: 360 });
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));
    await promise;
    expect(drawImageMock).toHaveBeenCalledWith(video, 0, 0, 640, 360);
  });

  it('seeks to the explicit atSeconds when provided', async () => {
    const { promise, video } = startPoster({ atSeconds: 3 });
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTime).toBe(3);
    video.dispatchEvent(new Event('seeked'));
    await promise;
  });

  it('defaults the seek to min(1, duration / 2)', async () => {
    const { promise, video } = startPoster({ duration: 1.5 });
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTime).toBe(0.75);
    video.dispatchEvent(new Event('seeked'));
    await promise;
  });

  it('seeks to 0 when the duration is not finite', async () => {
    const { promise, video } = startPoster({ duration: NaN });
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTime).toBe(0);
    video.dispatchEvent(new Event('seeked'));
    await promise;
  });

  it('resolves null when toBlob yields no blob', async () => {
    toBlobMock.mockImplementationOnce((callback: BlobCallback) => callback(null));
    const { promise, video } = startPoster();
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));
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
    video.dispatchEvent(new Event('seeked'));
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
