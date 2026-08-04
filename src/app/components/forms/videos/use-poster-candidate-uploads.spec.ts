/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';

import type { VideoPosterCandidate } from '@/lib/types/domain/video';

import { usePosterCandidateUploads } from './use-poster-candidate-uploads';

import type { PosterCandidate } from './video-metadata';

const getPresignedUploadUrlsActionMock = vi.hoisted(() => vi.fn());
const uploadFileToS3Mock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction: getPresignedUploadUrlsActionMock,
}));

vi.mock('@/lib/utils/direct-upload', () => ({
  uploadFileToS3: uploadFileToS3Mock,
}));

const makeCandidate = (n: number): PosterCandidate => ({
  blob: new Blob([`frame-${n}`], { type: 'image/jpeg' }),
  atSeconds: n + 2.7,
  score: 10 + n,
});

const presignedTarget = (n: number): { uploadUrl: string; s3Key: string; cdnUrl: string } => ({
  uploadUrl: `https://s3/candidate-${n}`,
  s3Key: `k-${n}`,
  cdnUrl: `https://cdn/candidate-${n}.jpg`,
});

/** A promise whose resolution is controlled from outside, for interleaving async fan-outs. */
const createDeferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolveDeferred: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve;
  });
  return { promise, resolve: resolveDeferred };
};

/** Drain the microtask queue several times over, without relying on fake/real timers. */
const flushMicrotasks = async (): Promise<void> => {
  for (let tick = 0; tick < 10; tick += 1) {
    await Promise.resolve();
  }
};

const renderUploads = (
  preGeneratedId = 'vid1'
): { current: ReturnType<typeof usePosterCandidateUploads> } =>
  renderHook(() => usePosterCandidateUploads({ preGeneratedId })).result;

describe('usePosterCandidateUploads', () => {
  beforeEach(() => {
    getPresignedUploadUrlsActionMock.mockReset();
    uploadFileToS3Mock.mockReset();
  });

  it('presigns once for the whole batch, PUTs every file, and settles aligned candidates', async () => {
    const candidates = [makeCandidate(0), makeCandidate(1)];
    getPresignedUploadUrlsActionMock.mockResolvedValue({
      success: true,
      data: [presignedTarget(1), presignedTarget(2)],
    });
    uploadFileToS3Mock.mockImplementation((_file: File, presigned: { cdnUrl: string }) =>
      Promise.resolve({ success: true, cdnUrl: presigned.cdnUrl })
    );

    const result = renderUploads();

    act(() => {
      result.current.startUploads(candidates);
    });

    let settled: (VideoPosterCandidate | null)[] = [];
    await act(async () => {
      settled = await result.current.getSettledAligned();
    });

    expect(getPresignedUploadUrlsActionMock).toHaveBeenCalledTimes(1);
    expect(getPresignedUploadUrlsActionMock).toHaveBeenCalledWith('videos', 'vid1', [
      {
        fileName: 'poster-candidate-1.jpg',
        contentType: 'image/jpeg',
        fileSize: candidates[0].blob.size,
      },
      {
        fileName: 'poster-candidate-2.jpg',
        contentType: 'image/jpeg',
        fileSize: candidates[1].blob.size,
      },
    ]);
    expect(uploadFileToS3Mock).toHaveBeenCalledTimes(2);
    expect(settled).toEqual([
      {
        url: 'https://cdn/candidate-1.jpg',
        atSeconds: candidates[0].atSeconds,
        score: candidates[0].score,
      },
      {
        url: 'https://cdn/candidate-2.jpg',
        atSeconds: candidates[1].atSeconds,
        score: candidates[1].score,
      },
    ]);
  });

  it('skips a frame whose PUT fails and keeps the rest', async () => {
    const candidates = [makeCandidate(0), makeCandidate(1), makeCandidate(2)];
    getPresignedUploadUrlsActionMock.mockResolvedValue({
      success: true,
      data: [presignedTarget(1), presignedTarget(2), presignedTarget(3)],
    });
    uploadFileToS3Mock
      .mockResolvedValueOnce({ success: true, cdnUrl: 'https://cdn/candidate-1.jpg' })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true, cdnUrl: 'https://cdn/candidate-3.jpg' });

    const result = renderUploads();

    act(() => {
      result.current.startUploads(candidates);
    });

    let settled: (VideoPosterCandidate | null)[] = [];
    await act(async () => {
      settled = await result.current.getSettledAligned();
    });

    expect(settled).toEqual([
      {
        url: 'https://cdn/candidate-1.jpg',
        atSeconds: candidates[0].atSeconds,
        score: candidates[0].score,
      },
      null,
      {
        url: 'https://cdn/candidate-3.jpg',
        atSeconds: candidates[2].atSeconds,
        score: candidates[2].score,
      },
    ]);
    expect(result.current.alignedNow).toEqual(settled);
  });

  it('settles empty and skips every PUT when the presign batch fails', async () => {
    const candidates = [makeCandidate(0), makeCandidate(1)];
    getPresignedUploadUrlsActionMock.mockResolvedValue({ success: false, error: 'Presign boom' });

    const result = renderUploads();

    act(() => {
      result.current.startUploads(candidates);
    });

    let settled: (VideoPosterCandidate | null)[] = [];
    await act(async () => {
      settled = await result.current.getSettledAligned();
    });

    expect(settled).toEqual([]);
    expect(uploadFileToS3Mock).not.toHaveBeenCalled();
  });

  it('resolves an empty array from getSettledAligned before any startUploads call', async () => {
    const result = renderUploads();

    let settled: (VideoPosterCandidate | null)[] = [];
    await act(async () => {
      settled = await result.current.getSettledAligned();
    });

    expect(settled).toEqual([]);
    expect(getPresignedUploadUrlsActionMock).not.toHaveBeenCalled();
  });

  it('keeps alignedNow at the newer run when an older stale run settles last', async () => {
    const staleCandidates = [makeCandidate(0)];
    const freshCandidates = [makeCandidate(9)];

    getPresignedUploadUrlsActionMock
      .mockResolvedValueOnce({ success: true, data: [presignedTarget(1)] })
      .mockResolvedValueOnce({ success: true, data: [presignedTarget(9)] });

    const staleUpload = createDeferred<{ success: boolean; cdnUrl?: string }>();
    uploadFileToS3Mock
      .mockImplementationOnce(() => staleUpload.promise)
      .mockResolvedValueOnce({ success: true, cdnUrl: 'https://cdn/candidate-9.jpg' });

    const result = renderUploads();

    // Older run starts first and stalls on its S3 PUT.
    act(() => {
      result.current.startUploads(staleCandidates);
    });
    // Newer run starts before the older run's fan-out has settled.
    act(() => {
      result.current.startUploads(freshCandidates);
    });

    const freshSettled = [
      {
        url: 'https://cdn/candidate-9.jpg',
        atSeconds: freshCandidates[0].atSeconds,
        score: freshCandidates[0].score,
      },
    ];

    let settled: (VideoPosterCandidate | null)[] = [];
    await act(async () => {
      settled = await result.current.getSettledAligned();
    });

    expect(settled).toEqual(freshSettled);
    expect(result.current.alignedNow).toEqual(freshSettled);

    // The stale (first) run's network call resolves AFTER the newer run has
    // already settled and applied its aligned state to alignedNow.
    await act(async () => {
      staleUpload.resolve({ success: true, cdnUrl: 'https://cdn/candidate-1.jpg' });
      await flushMicrotasks();
    });

    expect(result.current.alignedNow).toEqual(freshSettled);
  });

  it('settles empty and never lets a thrown presign error escape', async () => {
    const candidates = [makeCandidate(0), makeCandidate(1)];
    getPresignedUploadUrlsActionMock.mockRejectedValue(new Error('network'));

    const result = renderUploads();

    act(() => {
      result.current.startUploads(candidates);
    });

    let settled: (VideoPosterCandidate | null)[] = [];
    await act(async () => {
      settled = await result.current.getSettledAligned();
    });

    expect(settled).toEqual([]);
    expect(uploadFileToS3Mock).not.toHaveBeenCalled();
  });
});
