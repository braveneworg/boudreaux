// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { createFeaturedArtistAction } from '@/lib/actions/create-featured-artist-action';
import { publishFeaturedArtistsToSiteAction } from '@/lib/actions/publish-featured-artists-action';
import { updateFeaturedArtistCoverArtAction } from '@/lib/actions/update-featured-artist-cover-art-action';
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';

import {
  useCreateFeaturedArtistMutation,
  usePublishFeaturedArtistsMutation,
  useUpdateFeaturedArtistCoverArtMutation,
} from './use-featured-artist-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/lib/actions/create-featured-artist-action', () => ({
  createFeaturedArtistAction: vi.fn(),
}));
vi.mock('@/lib/actions/publish-featured-artists-action', () => ({
  publishFeaturedArtistsToSiteAction: vi.fn(),
}));
vi.mock('@/lib/actions/update-featured-artist-cover-art-action', () => ({
  updateFeaturedArtistCoverArtAction: vi.fn(),
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
});

describe('useCreateFeaturedArtistMutation', () => {
  it('calls createFeaturedArtistAction with the form state and data', async () => {
    vi.mocked(createFeaturedArtistAction).mockResolvedValue(okState);
    const opts = getOptions<{ formState: FormState; formData: FormData }>(
      useCreateFeaturedArtistMutation
    );
    const formData = new FormData();

    await opts.mutationFn({ formState: failState, formData });

    expect(createFeaturedArtistAction).toHaveBeenCalledWith(failState, formData);
  });

  it('invalidates the featured-artist cache on success', async () => {
    const opts = getOptions(useCreateFeaturedArtistMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.featuredArtists.all });
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(useCreateFeaturedArtistMutation);

    await opts.onSuccess(failState, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useUpdateFeaturedArtistCoverArtMutation', () => {
  it('calls updateFeaturedArtistCoverArtAction with the id and cover art', async () => {
    vi.mocked(updateFeaturedArtistCoverArtAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ featuredArtistId: string; coverArt: string }>(
      useUpdateFeaturedArtistCoverArtMutation
    );

    await opts.mutationFn({ featuredArtistId: 'fa-1', coverArt: 'https://cdn/x.webp' });

    expect(updateFeaturedArtistCoverArtAction).toHaveBeenCalledWith('fa-1', 'https://cdn/x.webp');
  });

  it('invalidates the featured-artist cache on success', async () => {
    const opts = getOptions(useUpdateFeaturedArtistCoverArtMutation);

    await opts.onSuccess({ success: true }, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.featuredArtists.all });
  });
});

describe('usePublishFeaturedArtistsMutation', () => {
  it('calls publishFeaturedArtistsToSiteAction and invalidates on success', async () => {
    vi.mocked(publishFeaturedArtistsToSiteAction).mockResolvedValue({ success: true });
    const opts = getOptions<void>(usePublishFeaturedArtistsMutation);

    await opts.mutationFn();
    await opts.onSuccess({ success: true }, undefined as never);

    expect(publishFeaturedArtistsToSiteAction).toHaveBeenCalled();
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.featuredArtists.all });
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(usePublishFeaturedArtistsMutation);

    await opts.onSuccess({ success: false }, undefined as never);

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});
