/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, renderHook, waitFor } from '@testing-library/react';

import { uploadVideoMultipart } from '@/lib/utils/multipart-upload';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { isUploadPreparing, useVideoUpload } from './use-video-upload';
import {
  captureVideoPosterCandidates,
  extractVideoDuration,
  type PosterCandidate,
} from './video-metadata';

import type { UseFormReturn } from 'react-hook-form';

vi.mock('@/lib/utils/multipart-upload', () => ({ uploadVideoMultipart: vi.fn() }));

vi.mock('./video-metadata', () => ({
  extractVideoDuration: vi.fn().mockResolvedValue(undefined),
  extractVideoTags: vi.fn().mockResolvedValue({ title: 'clip' }),
  captureVideoPosterCandidates: vi.fn().mockResolvedValue([]),
}));

vi.mock('./video-form-helpers', () => ({
  applyVideoPrefill: vi.fn(),
  validateVideoFile: vi.fn().mockReturnValue(null),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));

const PRE_GENERATED_ID = '507f1f77bcf86cd799439011';

const setup = (
  onPosterCandidates: (candidates: PosterCandidate[]) => void = vi.fn()
): ReturnType<typeof renderHook<ReturnType<typeof useVideoUpload>, void>> => {
  const form = { setValue: vi.fn() } as unknown as UseFormReturn<VideoFormData>;
  return renderHook(() =>
    useVideoUpload({ preGeneratedId: PRE_GENERATED_ID, form, onPosterCandidates })
  );
};

const setupWithCallback = (
  onUploadComplete: () => void
): ReturnType<typeof renderHook<ReturnType<typeof useVideoUpload>, void>> => {
  const form = { setValue: vi.fn() } as unknown as UseFormReturn<VideoFormData>;
  return renderHook(() =>
    useVideoUpload({
      preGeneratedId: PRE_GENERATED_ID,
      form,
      onPosterCandidates: vi.fn(),
      onUploadComplete,
    })
  );
};

const videoFile = (): File => new File(['video-bytes'], 'clip.mp4', { type: 'video/mp4' });

describe('useVideoUpload — unmount', () => {
  it('aborts the in-flight upload controller on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(uploadVideoMultipart).mockImplementation((_file, { signal }) => {
      capturedSignal = signal;
      // Never resolves — the upload stays in-flight until the abort fires.
      return new Promise(() => {});
    });

    const { result, unmount } = setup();
    await act(async () => {
      result.current.selectFile(videoFile());
    });
    await waitFor(() => expect(uploadVideoMultipart).toHaveBeenCalled());

    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });
});

describe('useVideoUpload — poster candidates', () => {
  it('forwards the captured candidates to onPosterCandidates', async () => {
    vi.mocked(uploadVideoMultipart).mockResolvedValue({
      success: true,
      s3Key: 'media/videos/x/clip.mp4',
      fileSize: 2048,
    });
    const candidates: PosterCandidate[] = [
      { blob: new Blob(['frame'], { type: 'image/jpeg' }), atSeconds: 3.7, score: 42 },
    ];
    vi.mocked(captureVideoPosterCandidates).mockResolvedValue(candidates);
    const onPosterCandidates = vi.fn();

    const { result } = setup(onPosterCandidates);
    await act(async () => {
      result.current.selectFile(videoFile());
    });

    await waitFor(() => expect(onPosterCandidates).toHaveBeenCalledWith(candidates));
  });
});

describe('useVideoUpload — onUploadComplete callback', () => {
  it('fires onUploadComplete once after a successful upload', async () => {
    vi.mocked(uploadVideoMultipart).mockResolvedValue({
      success: true,
      s3Key: 'media/videos/x/clip.mp4',
      fileSize: 2048,
    });
    const onUploadComplete = vi.fn();

    const { result } = setupWithCallback(onUploadComplete);
    await act(async () => {
      result.current.selectFile(videoFile());
    });

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledTimes(1));
  });

  it('does not fire onUploadComplete when the upload fails', async () => {
    vi.mocked(uploadVideoMultipart).mockResolvedValue({
      success: false,
      error: 'Network exploded',
    });
    const onUploadComplete = vi.fn();

    const { result } = setupWithCallback(onUploadComplete);
    await act(async () => {
      result.current.selectFile(videoFile());
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(onUploadComplete).not.toHaveBeenCalled();
  });
});

describe('useVideoUpload — preparing state', () => {
  it('enters preparing synchronously on select, before any extraction settles', async () => {
    vi.mocked(uploadVideoMultipart).mockImplementation(() => new Promise(() => {}));

    const { result } = setup();
    act(() => {
      result.current.selectFile(videoFile());
    });

    expect(result.current.status).toBe('preparing');
  });

  it('resets progress to zero when preparing', async () => {
    vi.mocked(uploadVideoMultipart).mockImplementation(() => new Promise(() => {}));

    const { result } = setup();
    act(() => {
      result.current.selectFile(videoFile());
    });

    expect(result.current.progress).toBe(0);
  });

  it('moves to uploading at 0% once the multipart starts', async () => {
    vi.mocked(uploadVideoMultipart).mockImplementation(() => new Promise(() => {}));

    const { result } = setup();
    await act(async () => {
      result.current.selectFile(videoFile());
    });
    await waitFor(() => expect(uploadVideoMultipart).toHaveBeenCalled());

    expect(result.current.status).toBe('uploading');
    expect(result.current.progress).toBe(0);
  });

  it('reports an error when the metadata extraction rejects', async () => {
    vi.mocked(extractVideoDuration).mockRejectedValueOnce(new Error('decoder exploded'));

    const { result } = setup();
    await act(async () => {
      result.current.selectFile(videoFile());
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('Could not read the video file.');
  });

  it('never starts the multipart when the metadata extraction rejects', async () => {
    vi.mocked(extractVideoDuration).mockRejectedValueOnce(new Error('decoder exploded'));

    const { result } = setup();
    await act(async () => {
      result.current.selectFile(videoFile());
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(uploadVideoMultipart).not.toHaveBeenCalled();
  });
});

describe('isUploadPreparing', () => {
  it.each([
    ['idle', 0, false],
    ['preparing', 0, true],
    ['uploading', 0, true],
    ['uploading', 1, false],
    ['success', 0, false],
    ['error', 0, false],
  ] as const)('%s at %d percent → %s', (status, progress, expected) => {
    expect(isUploadPreparing(status, progress)).toBe(expected);
  });
});
