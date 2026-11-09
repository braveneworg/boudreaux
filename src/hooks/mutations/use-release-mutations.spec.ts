// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { createReleaseAction } from '@/lib/actions/create-release-action';
import { deleteReleaseAction } from '@/lib/actions/delete-release-action';
import { publishReleaseAction } from '@/lib/actions/publish-release-action';
import { updateReleaseAction } from '@/lib/actions/update-release-action';
import { updateReleaseCoverArtAction } from '@/lib/actions/update-release-cover-art-action';
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';
import type {
  CreateReleaseActionInput,
  ReleaseFormData,
} from '@/lib/validation/create-release-schema';

import {
  useCreateReleaseMutation,
  useDeleteReleaseMutation,
  usePublishReleaseMutation,
  useUpdateReleaseMutation,
  useUpdateReleaseCoverArtMutation,
} from './use-release-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/lib/actions/create-release-action', () => ({ createReleaseAction: vi.fn() }));
vi.mock('@/lib/actions/update-release-action', () => ({ updateReleaseAction: vi.fn() }));
vi.mock('@/lib/actions/update-release-cover-art-action', () => ({
  updateReleaseCoverArtAction: vi.fn(),
}));
vi.mock('@/lib/actions/delete-release-action', () => ({ deleteReleaseAction: vi.fn() }));
vi.mock('@/lib/actions/publish-release-action', () => ({ publishReleaseAction: vi.fn() }));

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

describe('useCreateReleaseMutation', () => {
  const createValues: CreateReleaseActionInput = {
    title: 'Album',
    releasedOn: '2026-01-01',
    coverArt: 'https://x/y.png',
    formats: ['DIGITAL'],
    artistIds: ['a'.repeat(24)],
    preGeneratedId: 'p1',
  };

  // Arrays stay arrays: no JSON encoding on the way to the action.
  it('passes the release values and pre-generated id to createReleaseAction as they are', async () => {
    vi.mocked(createReleaseAction).mockResolvedValue(okState);
    const opts = getOptions<CreateReleaseActionInput>(useCreateReleaseMutation);

    await opts.mutationFn(createValues);

    expect(vi.mocked(createReleaseAction).mock.calls).toEqual([[createValues]]);
  });

  it("passes the admin's credit decisions beside the form values", async () => {
    vi.mocked(createReleaseAction).mockResolvedValue(okState);
    const creditDecisions = { publishArtistIds: ['a'], keepHiddenArtistIds: [] };
    const opts = getOptions<CreateReleaseActionInput>(useCreateReleaseMutation);

    await opts.mutationFn({ ...createValues, creditDecisions });

    expect(vi.mocked(createReleaseAction).mock.calls.at(-1)?.[0].creditDecisions).toEqual(
      creditDecisions
    );
  });

  it('invalidates release and artist caches on success', async () => {
    const opts = getOptions(useCreateReleaseMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.releases.all });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.artists.all });
  });

  it('does not invalidate when the action reports failure', async () => {
    const opts = getOptions(useCreateReleaseMutation);

    await opts.onSuccess(failState, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useUpdateReleaseMutation', () => {
  // The blanks reach the action, which clears those fields (#759).
  it('passes the release id and values, blanks included, to updateReleaseAction', async () => {
    vi.mocked(updateReleaseAction).mockResolvedValue(okState);
    const opts = getOptions<{ id: string; values: ReleaseFormData }>(useUpdateReleaseMutation);
    const values = { title: 'Album', catalogNumber: '', description: '' } as ReleaseFormData;

    await opts.mutationFn({ id: 'r1', values });

    expect(vi.mocked(updateReleaseAction).mock.calls).toEqual([
      ['r1', { ...values, creditDecisions: undefined }],
    ]);
  });

  it('invalidates release and artist caches on success', async () => {
    const opts = getOptions(useUpdateReleaseMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.releases.all });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.artists.all });
  });

  it('does not invalidate when the action reports failure', async () => {
    const opts = getOptions(useUpdateReleaseMutation);

    await opts.onSuccess(failState, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useUpdateReleaseCoverArtMutation', () => {
  it('calls updateReleaseCoverArtAction with the release id and cover art', async () => {
    vi.mocked(updateReleaseCoverArtAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ releaseId: string; coverArt: string }>(
      useUpdateReleaseCoverArtMutation
    );

    await opts.mutationFn({ releaseId: 'r-1', coverArt: 'https://cdn/x.webp' });

    expect(updateReleaseCoverArtAction).toHaveBeenCalledWith('r-1', 'https://cdn/x.webp');
  });

  it('invalidates caches on success', async () => {
    const opts = getOptions(useUpdateReleaseCoverArtMutation);

    await opts.onSuccess({ success: true }, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.releases.all });
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(useUpdateReleaseCoverArtMutation);

    await opts.onSuccess({ success: false }, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useDeleteReleaseMutation', () => {
  it('calls deleteReleaseAction with the release id', async () => {
    vi.mocked(deleteReleaseAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ releaseId: string }>(useDeleteReleaseMutation);

    await opts.mutationFn({ releaseId: 'r-1' });

    expect(deleteReleaseAction).toHaveBeenCalledWith('r-1');
  });

  it('invalidates release and artist caches on success', async () => {
    const opts = getOptions(useDeleteReleaseMutation);

    await opts.onSuccess({ success: true }, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.releases.all });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.artists.all });
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(useDeleteReleaseMutation);

    await opts.onSuccess({ success: false }, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useUpdateReleaseMutation credit decisions', () => {
  it("passes the admin's credit decisions beside the form values", async () => {
    vi.mocked(updateReleaseAction).mockResolvedValue(okState);
    const creditDecisions = { publishArtistIds: ['a'], keepHiddenArtistIds: [] };
    const opts = getOptions<{
      id: string;
      values: ReleaseFormData;
      creditDecisions?: typeof creditDecisions;
    }>(useUpdateReleaseMutation);

    await opts.mutationFn({
      id: 'r-1',
      values: {
        title: 'Album',
        releasedOn: '2026-01-01',
        coverArt: 'https://x/y.png',
        formats: ['DIGITAL'],
        artistIds: ['a'.repeat(24)],
      },
      creditDecisions,
    });

    expect(vi.mocked(updateReleaseAction).mock.calls.at(-1)?.[1].creditDecisions).toEqual(
      creditDecisions
    );
  });
});

describe('usePublishReleaseMutation', () => {
  it("calls publishReleaseAction with the release id and the admin's decisions", async () => {
    vi.mocked(publishReleaseAction).mockResolvedValue({ success: true });
    const decisions = { publishArtistIds: ['a'], keepHiddenArtistIds: ['b'] };
    const opts = getOptions<{ releaseId: string; decisions: typeof decisions }>(
      usePublishReleaseMutation
    );

    await opts.mutationFn({ releaseId: 'r-1', decisions });

    expect(vi.mocked(publishReleaseAction).mock.calls.at(-1)).toEqual(['r-1', decisions]);
  });

  it('invalidates release and artist caches on success', async () => {
    const opts = getOptions(usePublishReleaseMutation);

    await opts.onSuccess({ success: true }, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.releases.all });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.artists.all });
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(usePublishReleaseMutation);

    await opts.onSuccess({ success: false }, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});
