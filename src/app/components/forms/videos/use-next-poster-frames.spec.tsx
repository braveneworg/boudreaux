/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';

import { VIDEO_POSTER_CANDIDATE_CAP } from '@/lib/constants/video-uploads';
import type { VideoPosterCandidate } from '@/lib/types/domain/video';

import { useNextPosterFrames, type UseNextPosterFramesArgs } from './use-next-poster-frames';

import type * as videoMetadata from './video-metadata';
import type { PosterCandidate } from './video-metadata';

const mocks = vi.hoisted(() => ({
  capturePosterCandidatesFromSource: vi.fn(),
  uploadPosterCandidates: vi.fn(),
  appendVideoPosterCandidatesAsync: vi.fn(),
}));

vi.mock('./video-metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof videoMetadata>()),
  capturePosterCandidatesFromSource: mocks.capturePosterCandidatesFromSource,
}));

vi.mock('./use-poster-candidate-uploads', () => ({
  uploadPosterCandidates: mocks.uploadPosterCandidates,
}));

vi.mock('@/hooks/mutations/use-video-mutations', () => ({
  useAppendVideoPosterCandidatesMutation: () => ({
    appendVideoPosterCandidates: vi.fn(),
    appendVideoPosterCandidatesAsync: mocks.appendVideoPosterCandidatesAsync,
    isAppendingVideoPosterCandidates: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const VIDEO_ID = '507f1f77bcf86cd799439011';
const STREAM_URL = 'https://cdn.example.com/media/videos/vid1/clip.mp4';

const captured = (atSeconds: number): PosterCandidate => ({
  blob: new Blob([`frame-${atSeconds}`], { type: 'image/jpeg' }),
  atSeconds,
  score: 1,
});

const uploaded = (index: number, atSeconds: number): VideoPosterCandidate => ({
  url: `https://cdn.example.com/media/videos/vid1/poster-candidate-${index}.jpg`,
  atSeconds,
  score: 1,
});

const CAPTURED = [captured(10.7), captured(12.1)];
const UPLOADED = [uploaded(6, 10.7), uploaded(7, 12.1)];

const baseArgs = (): UseNextPosterFramesArgs => ({
  source: STREAM_URL,
  durationSeconds: 245,
  latestAtSeconds: 9.3,
  candidateCount: 5,
  preGeneratedId: VIDEO_ID,
  effectiveVideoId: VIDEO_ID,
  isPersisted: true,
  isUploadBusy: false,
  onAppended: vi.fn(),
});

interface FramesHarness {
  /** Live view of the hook result (re-read after every act). */
  readonly current: ReturnType<typeof useNextPosterFrames>;
  args: UseNextPosterFramesArgs;
}

const renderFrames = (overrides: Partial<UseNextPosterFramesArgs> = {}): FramesHarness => {
  const args = { ...baseArgs(), ...overrides };
  const { result } = renderHook(() => useNextPosterFrames(args));
  return {
    args,
    get current() {
      return result.current;
    },
  };
};

beforeEach(() => {
  mocks.capturePosterCandidatesFromSource.mockResolvedValue(CAPTURED);
  mocks.uploadPosterCandidates.mockResolvedValue(UPLOADED);
  mocks.appendVideoPosterCandidatesAsync.mockResolvedValue({ success: true });
});

describe('useNextPosterFrames — availability', () => {
  it('is available once a row exists, the upload is idle, and a later window fits', () => {
    const frames = renderFrames();

    expect(frames.current.blocker).toBeNull();
  });

  it('reports the next window start', () => {
    const frames = renderFrames();

    expect(frames.current.nextWindowStart).toBe(10);
  });

  it('is blocked while the upload is still in flight', () => {
    expect(renderFrames({ isUploadBusy: true }).current.blocker).toBe('uploading');
  });

  it('is blocked until the row exists', () => {
    expect(renderFrames({ isPersisted: false }).current.blocker).toBe('uploading');
    expect(renderFrames({ effectiveVideoId: undefined }).current.blocker).toBe('uploading');
  });

  it('is blocked at the candidate cap', () => {
    const atCap = renderFrames({ candidateCount: VIDEO_POSTER_CANDIDATE_CAP });
    const oneBatchShort = renderFrames({ candidateCount: VIDEO_POSTER_CANDIDATE_CAP - 5 });
    const tooFewLeft = renderFrames({ candidateCount: VIDEO_POSTER_CANDIDATE_CAP - 4 });

    expect(atCap.current.blocker).toBe('cap');
    expect(oneBatchShort.current.blocker).toBeNull();
    expect(tooFewLeft.current.blocker).toBe('cap');
  });

  it('is blocked once the next window would start past the end', () => {
    expect(renderFrames({ durationSeconds: 10 }).current.blocker).toBe('end');
  });

  it('is blocked when the duration is unknown', () => {
    expect(renderFrames({ durationSeconds: null }).current.blocker).toBe('end');
  });

  it('is blocked when there is nothing to decode from', () => {
    expect(renderFrames({ source: null }).current.blocker).toBe('no-source');
  });

  it('reports the upload block ahead of every other one', () => {
    expect(
      renderFrames({ isUploadBusy: true, source: null, candidateCount: 25 }).current.blocker
    ).toBe('uploading');
  });
});

describe('useNextPosterFrames — a press', () => {
  it('captures the next window from the source', async () => {
    const frames = renderFrames();

    await act(async () => frames.current.requestNextFrames());

    expect(mocks.capturePosterCandidatesFromSource).toHaveBeenCalledWith({
      src: STREAM_URL,
      windowStart: 10,
    });
  });

  it('decodes the local file when one is in hand', async () => {
    const file = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' });
    const frames = renderFrames({ source: file });

    await act(async () => frames.current.requestNextFrames());

    expect(mocks.capturePosterCandidatesFromSource).toHaveBeenCalledWith({
      src: file,
      windowStart: 10,
    });
  });

  it('uploads the captured frames numbered after the ones the video holds', async () => {
    const frames = renderFrames({ candidateCount: 5 });

    await act(async () => frames.current.requestNextFrames());

    expect(mocks.uploadPosterCandidates).toHaveBeenCalledWith(CAPTURED, VIDEO_ID, 5);
  });

  it('persists the surviving uploads onto the row', async () => {
    mocks.uploadPosterCandidates.mockResolvedValue([UPLOADED[0], null]);
    const frames = renderFrames();

    await act(async () => frames.current.requestNextFrames());

    expect(mocks.appendVideoPosterCandidatesAsync).toHaveBeenCalledWith({
      videoId: VIDEO_ID,
      candidates: [UPLOADED[0]],
    });
  });

  it('hands the persisted frames to the caller', async () => {
    const frames = renderFrames();

    await act(async () => frames.current.requestNextFrames());

    expect(frames.args.onAppended).toHaveBeenCalledWith(UPLOADED);
  });

  it('shows no toast on success — the strip growing is the feedback', async () => {
    const frames = renderFrames();

    await act(async () => frames.current.requestNextFrames());

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('is capturing while the press is in flight and idle after', async () => {
    let resolveCapture: (value: PosterCandidate[]) => void = () => undefined;
    mocks.capturePosterCandidatesFromSource.mockReturnValue(
      new Promise<PosterCandidate[]>((resolve) => {
        resolveCapture = resolve;
      })
    );
    const frames = renderFrames();

    act(() => {
      void frames.current.requestNextFrames();
    });
    expect(frames.current.isCapturing).toBe(true);

    await act(async () => resolveCapture(CAPTURED));
    expect(frames.current.isCapturing).toBe(false);
  });

  it('ignores a press while blocked', async () => {
    const frames = renderFrames({ source: null });

    await act(async () => frames.current.requestNextFrames());

    expect(mocks.capturePosterCandidatesFromSource).not.toHaveBeenCalled();
  });
});

describe('useNextPosterFrames — failures', () => {
  it('toasts and uploads nothing when the source yields no frames', async () => {
    mocks.capturePosterCandidatesFromSource.mockResolvedValue([]);
    const frames = renderFrames();

    await act(async () => frames.current.requestNextFrames());

    expect(toast.error).toHaveBeenCalledWith('Could not read more frames from this video.');
    expect(mocks.uploadPosterCandidates).not.toHaveBeenCalled();
    expect(frames.args.onAppended).not.toHaveBeenCalled();
  });

  it('toasts and persists nothing when every upload fails', async () => {
    mocks.uploadPosterCandidates.mockResolvedValue([null, null]);
    const frames = renderFrames();

    await act(async () => frames.current.requestNextFrames());

    expect(toast.error).toHaveBeenCalledWith('Could not store the new frames.');
    expect(mocks.appendVideoPosterCandidatesAsync).not.toHaveBeenCalled();
    expect(frames.args.onAppended).not.toHaveBeenCalled();
  });

  it('toasts the server refusal and keeps the strip as it was', async () => {
    mocks.appendVideoPosterCandidatesAsync.mockResolvedValue({
      success: false,
      error: 'Poster frame limit reached',
    });
    const frames = renderFrames();

    await act(async () => frames.current.requestNextFrames());

    expect(toast.error).toHaveBeenCalledWith('Poster frame limit reached');
    expect(frames.args.onAppended).not.toHaveBeenCalled();
  });

  it('toasts a generic error when the persist throws', async () => {
    mocks.appendVideoPosterCandidatesAsync.mockRejectedValue(new Error('offline'));
    const frames = renderFrames();

    await act(async () => frames.current.requestNextFrames());

    expect(toast.error).toHaveBeenCalledWith('Could not store the new frames.');
    expect(frames.current.isCapturing).toBe(false);
  });
});
