// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { archiveVideoAction } from '@/lib/actions/archive-video-action';
import { createVideoAction } from '@/lib/actions/create-video-action';
import { deleteVideoAction } from '@/lib/actions/delete-video-action';
import { publishVideoAction } from '@/lib/actions/publish-video-action';
import { restoreVideoAction } from '@/lib/actions/restore-video-action';
import { unpublishVideoAction } from '@/lib/actions/unpublish-video-action';
import { updateVideoAction } from '@/lib/actions/update-video-action';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import {
  useArchiveVideoMutation,
  useCreateVideoMutation,
  useDeleteVideoMutation,
  usePublishVideoMutation,
  useRestoreVideoMutation,
  useUnpublishVideoMutation,
  useUpdateVideoMutation,
} from './use-video-mutations';

// ── Predicate helpers shared across tests ─────────────────────────────────────

/** Build a minimal Query-like object for predicate assertions. */
const fakeQuery = (queryKey: unknown[]): { queryKey: unknown[] } => ({ queryKey });

/** Extract the predicate fn from the first invalidateQueries call. */
const capturedPredicate = (): ((q: { queryKey: unknown[] }) => boolean) => {
  const call = invalidateQueriesMock.mock.calls[0] as unknown as [
    { predicate: (q: { queryKey: unknown[] }) => boolean },
  ];
  return call[0].predicate;
};

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/lib/actions/create-video-action', () => ({ createVideoAction: vi.fn() }));
vi.mock('@/lib/actions/update-video-action', () => ({ updateVideoAction: vi.fn() }));
vi.mock('@/lib/actions/publish-video-action', () => ({ publishVideoAction: vi.fn() }));
vi.mock('@/lib/actions/unpublish-video-action', () => ({ unpublishVideoAction: vi.fn() }));
vi.mock('@/lib/actions/archive-video-action', () => ({ archiveVideoAction: vi.fn() }));
vi.mock('@/lib/actions/restore-video-action', () => ({ restoreVideoAction: vi.fn() }));
vi.mock('@/lib/actions/delete-video-action', () => ({ deleteVideoAction: vi.fn() }));

interface MutationOptions<TVariables> {
  mutationFn: (variables: TVariables) => Promise<unknown>;
  onSuccess: (result: { success: boolean }, variables: unknown) => Promise<unknown> | undefined;
}

const getOptions = <TVariables>(renderFn: () => unknown): MutationOptions<TVariables> => {
  renderHook(renderFn);
  return useMutationMock.mock.calls.at(-1)?.[0] as MutationOptions<TVariables>;
};

const okState: FormState = { fields: {}, success: true };
const failState: FormState = { fields: {}, success: false };

beforeEach(() => {
  useMutationMock.mockReset();
  invalidateQueriesMock.mockClear();
  useMutationMock.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
    reset: vi.fn(),
  });
});

describe('useCreateVideoMutation', () => {
  it('calls createVideoAction with the empty form state', async () => {
    vi.mocked(createVideoAction).mockResolvedValue(okState);
    const opts = getOptions<VideoFormData & { preGeneratedId?: string }>(useCreateVideoMutation);

    await opts.mutationFn({
      title: 'Clip',
      artist: 'Band',
      category: 'MUSIC',
      releasedOn: '2026-01-01',
      s3Key: 'media/videos/x/clip.mp4',
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
      preGeneratedId: 'p1',
    });

    expect(vi.mocked(createVideoAction).mock.calls[0]?.[0]).toBe(EMPTY_FORM_STATE);
  });

  it('serializes the video title into the form data', async () => {
    vi.mocked(createVideoAction).mockResolvedValue(okState);
    const opts = getOptions<VideoFormData & { preGeneratedId?: string }>(useCreateVideoMutation);

    await opts.mutationFn({
      title: 'Clip',
      artist: 'Band',
      category: 'MUSIC',
      releasedOn: '2026-01-01',
      s3Key: 'media/videos/x/clip.mp4',
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
      preGeneratedId: 'p1',
    });

    expect(vi.mocked(createVideoAction).mock.calls[0]?.[1].get('title')).toBe('Clip');
  });

  it('invalidates videos.detail and videos.list queries on success via predicate', async () => {
    const opts = getOptions(useCreateVideoMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledOnce();
    const predicate = capturedPredicate();
    // detail and adminInfinite queries should be matched
    expect(predicate(fakeQuery(['videos', 'detail', 'v1']))).toBe(true);
    expect(predicate(fakeQuery(['videos', 'adminInfinite', '', null, false, 'asc']))).toBe(true);
  });

  it('does not invalidate the videos.probePrefill query on success', async () => {
    const opts = getOptions(useCreateVideoMutation);

    await opts.onSuccess(okState, {});

    const predicate = capturedPredicate();
    // probePrefill key must be excluded so a mounted probe query is not refetched
    expect(predicate(fakeQuery(['videos', 'probePrefill', 'media/videos/v/f.mp4', 'v1']))).toBe(
      false
    );
  });

  it('does not invalidate queries from other top-level domains', async () => {
    const opts = getOptions(useCreateVideoMutation);

    await opts.onSuccess(okState, {});

    const predicate = capturedPredicate();
    expect(predicate(fakeQuery(['artists', 'detail', 'a1']))).toBe(false);
  });

  it('does not invalidate when the action reports failure', async () => {
    const opts = getOptions(useCreateVideoMutation);

    await opts.onSuccess(failState, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useUpdateVideoMutation', () => {
  it('calls updateVideoAction with the video id', async () => {
    vi.mocked(updateVideoAction).mockResolvedValue(okState);
    const opts = getOptions<{ id: string; values: VideoFormData }>(useUpdateVideoMutation);

    await opts.mutationFn({ id: 'v1', values: { title: 'Clip' } as VideoFormData });

    expect(vi.mocked(updateVideoAction).mock.calls[0]?.[0]).toBe('v1');
  });

  it('invalidates the videos cache on success', async () => {
    const opts = getOptions(useUpdateVideoMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledOnce();
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(useUpdateVideoMutation);

    await opts.onSuccess(failState, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('usePublishVideoMutation', () => {
  it('calls publishVideoAction with the video id', async () => {
    vi.mocked(publishVideoAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ videoId: string }>(usePublishVideoMutation);

    await opts.mutationFn({ videoId: 'v-1' });

    expect(publishVideoAction).toHaveBeenCalledWith('v-1');
  });

  it('invalidates the videos cache on success', async () => {
    const opts = getOptions(usePublishVideoMutation);

    await opts.onSuccess({ success: true }, {});

    expect(invalidateQueriesMock).toHaveBeenCalledOnce();
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(usePublishVideoMutation);

    await opts.onSuccess({ success: false }, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useUnpublishVideoMutation', () => {
  it('calls unpublishVideoAction with the video id', async () => {
    vi.mocked(unpublishVideoAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ videoId: string }>(useUnpublishVideoMutation);

    await opts.mutationFn({ videoId: 'v-1' });

    expect(unpublishVideoAction).toHaveBeenCalledWith('v-1');
  });

  it('invalidates the videos cache on success', async () => {
    const opts = getOptions(useUnpublishVideoMutation);

    await opts.onSuccess({ success: true }, {});

    expect(invalidateQueriesMock).toHaveBeenCalledOnce();
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(useUnpublishVideoMutation);

    await opts.onSuccess({ success: false }, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useArchiveVideoMutation', () => {
  it('calls archiveVideoAction with the video id', async () => {
    vi.mocked(archiveVideoAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ videoId: string }>(useArchiveVideoMutation);

    await opts.mutationFn({ videoId: 'v-1' });

    expect(archiveVideoAction).toHaveBeenCalledWith('v-1');
  });

  it('invalidates the videos cache on success', async () => {
    const opts = getOptions(useArchiveVideoMutation);

    await opts.onSuccess({ success: true }, {});

    expect(invalidateQueriesMock).toHaveBeenCalledOnce();
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(useArchiveVideoMutation);

    await opts.onSuccess({ success: false }, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useRestoreVideoMutation', () => {
  it('calls restoreVideoAction with the video id', async () => {
    vi.mocked(restoreVideoAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ videoId: string }>(useRestoreVideoMutation);

    await opts.mutationFn({ videoId: 'v-1' });

    expect(restoreVideoAction).toHaveBeenCalledWith('v-1');
  });

  it('invalidates the videos cache on success', async () => {
    const opts = getOptions(useRestoreVideoMutation);

    await opts.onSuccess({ success: true }, {});

    expect(invalidateQueriesMock).toHaveBeenCalledOnce();
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(useRestoreVideoMutation);

    await opts.onSuccess({ success: false }, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useDeleteVideoMutation', () => {
  it('calls deleteVideoAction with the video id', async () => {
    vi.mocked(deleteVideoAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ videoId: string }>(useDeleteVideoMutation);

    await opts.mutationFn({ videoId: 'v-1' });

    expect(deleteVideoAction).toHaveBeenCalledWith('v-1');
  });

  it('invalidates the videos cache on success', async () => {
    const opts = getOptions(useDeleteVideoMutation);

    await opts.onSuccess({ success: true }, {});

    expect(invalidateQueriesMock).toHaveBeenCalledOnce();
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(useDeleteVideoMutation);

    await opts.onSuccess({ success: false }, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});
