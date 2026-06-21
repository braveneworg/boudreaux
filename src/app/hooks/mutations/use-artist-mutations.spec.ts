// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { createArtistAction } from '@/lib/actions/create-artist-action';
import { updateArtistAction } from '@/lib/actions/update-artist-action';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

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

describe('useCreateArtistMutation', () => {
  it('calls createArtistAction with the empty form state', async () => {
    vi.mocked(createArtistAction).mockResolvedValue(okState);
    const opts = getOptions<ArtistFormData>(useCreateArtistMutation);

    await opts.mutationFn({ slug: 'john-doe', displayName: 'John' });

    expect(createArtistAction).toHaveBeenCalledWith(EMPTY_FORM_STATE, expect.any(FormData));
  });

  it('serializes the artist values to FormData', async () => {
    vi.mocked(createArtistAction).mockResolvedValue(okState);
    const opts = getOptions<ArtistFormData>(useCreateArtistMutation);

    await opts.mutationFn({ slug: 'john-doe', displayName: 'John' });

    expect(vi.mocked(createArtistAction).mock.calls[0][1].get('slug')).toBe('john-doe');
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
  it('calls updateArtistAction with the artist id', async () => {
    vi.mocked(updateArtistAction).mockResolvedValue(okState);
    const opts = getOptions<{ id: string; values: ArtistFormData }>(useUpdateArtistMutation);

    await opts.mutationFn({ id: 'a1', values: { slug: 'john-doe' } });

    expect(updateArtistAction).toHaveBeenCalledWith('a1', EMPTY_FORM_STATE, expect.any(FormData));
  });

  it('serializes the artist values to FormData', async () => {
    vi.mocked(updateArtistAction).mockResolvedValue(okState);
    const opts = getOptions<{ id: string; values: ArtistFormData }>(useUpdateArtistMutation);

    await opts.mutationFn({ id: 'a1', values: { slug: 'john-doe' } });

    expect(vi.mocked(updateArtistAction).mock.calls[0][2].get('slug')).toBe('john-doe');
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
