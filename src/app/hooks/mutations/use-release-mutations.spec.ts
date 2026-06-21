// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { createReleaseAction } from '@/lib/actions/create-release-action';
import { updateReleaseAction } from '@/lib/actions/update-release-action';
import { updateReleaseCoverArtAction } from '@/lib/actions/update-release-cover-art-action';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';

import {
  useCreateReleaseMutation,
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
  it('calls createReleaseAction with the empty form state', async () => {
    vi.mocked(createReleaseAction).mockResolvedValue(okState);
    const opts = getOptions<ReleaseFormData & { preGeneratedId?: string }>(
      useCreateReleaseMutation
    );

    await opts.mutationFn({
      title: 'Album',
      releasedOn: '2026-01-01',
      coverArt: 'https://x/y.png',
      formats: ['DIGITAL'],
      artistIds: ['a'.repeat(24)],
      preGeneratedId: 'p1',
    });

    expect(vi.mocked(createReleaseAction).mock.calls[0]?.[0]).toBe(EMPTY_FORM_STATE);
  });

  it('serializes the release title into the form data', async () => {
    vi.mocked(createReleaseAction).mockResolvedValue(okState);
    const opts = getOptions<ReleaseFormData & { preGeneratedId?: string }>(
      useCreateReleaseMutation
    );

    await opts.mutationFn({
      title: 'Album',
      releasedOn: '2026-01-01',
      coverArt: 'https://x/y.png',
      formats: ['DIGITAL'],
      artistIds: ['a'.repeat(24)],
      preGeneratedId: 'p1',
    });

    expect(vi.mocked(createReleaseAction).mock.calls[0]?.[1].get('title')).toBe('Album');
  });

  it('json-encodes array fields in the form data', async () => {
    vi.mocked(createReleaseAction).mockResolvedValue(okState);
    const opts = getOptions<ReleaseFormData & { preGeneratedId?: string }>(
      useCreateReleaseMutation
    );

    await opts.mutationFn({
      title: 'Album',
      releasedOn: '2026-01-01',
      coverArt: 'https://x/y.png',
      formats: ['DIGITAL'],
      artistIds: ['a'.repeat(24)],
      preGeneratedId: 'p1',
    });

    expect(vi.mocked(createReleaseAction).mock.calls[0]?.[1].get('formats')).toBe('["DIGITAL"]');
  });

  it('invalidates release and artist caches on success', async () => {
    const opts = getOptions(useCreateReleaseMutation);

    await opts.onSuccess(okState, { formState: failState, formData: new FormData() });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.releases.all });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.artists.all });
  });

  it('does not invalidate when the action reports failure', async () => {
    const opts = getOptions(useCreateReleaseMutation);

    await opts.onSuccess(failState, { formState: failState, formData: new FormData() });

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useUpdateReleaseMutation', () => {
  it('calls updateReleaseAction with the release id', async () => {
    vi.mocked(updateReleaseAction).mockResolvedValue(okState);
    const opts = getOptions<{ id: string; values: ReleaseFormData }>(useUpdateReleaseMutation);

    await opts.mutationFn({ id: 'r1', values: { title: 'Album' } as ReleaseFormData });

    expect(vi.mocked(updateReleaseAction).mock.calls[0]?.[0]).toBe('r1');
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
