// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { createArtistAction } from '@/lib/actions/create-artist-action';
import { updateArtistAction } from '@/lib/actions/update-artist-action';
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';

import { useCreateArtistMutation, useUpdateArtistMutation } from './use-artist-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/lib/actions/create-artist-action', () => ({ createArtistAction: vi.fn() }));
vi.mock('@/lib/actions/update-artist-action', () => ({ updateArtistAction: vi.fn() }));

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
});

describe('useCreateArtistMutation', () => {
  it('calls createArtistAction with the form state and data', async () => {
    vi.mocked(createArtistAction).mockResolvedValue(okState);
    const opts = getOptions<{ formState: FormState; formData: FormData }>(useCreateArtistMutation);
    const formData = new FormData();

    await opts.mutationFn({ formState: failState, formData });

    expect(createArtistAction).toHaveBeenCalledWith(failState, formData);
  });

  it('invalidates artist and release caches on success', async () => {
    const opts = getOptions(useCreateArtistMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.artists.all });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.releases.all });
  });

  it('does not invalidate when the action reports failure', async () => {
    const opts = getOptions(useCreateArtistMutation);

    await opts.onSuccess(failState, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useUpdateArtistMutation', () => {
  it('calls updateArtistAction with the artist id, state, and data', async () => {
    vi.mocked(updateArtistAction).mockResolvedValue(okState);
    const opts = getOptions<{ artistId: string; formState: FormState; formData: FormData }>(
      useUpdateArtistMutation
    );
    const formData = new FormData();

    await opts.mutationFn({ artistId: 'a-1', formState: failState, formData });

    expect(updateArtistAction).toHaveBeenCalledWith('a-1', failState, formData);
  });

  it('invalidates artist and release caches on success', async () => {
    const opts = getOptions(useUpdateArtistMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.artists.all });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.releases.all });
  });

  it('does not invalidate when the action reports failure', async () => {
    const opts = getOptions(useUpdateArtistMutation);

    await opts.onSuccess(failState, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});
