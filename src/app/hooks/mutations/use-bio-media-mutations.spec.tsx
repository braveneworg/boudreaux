// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';
import { toast } from 'sonner';

import { createArtistBioLinkAction } from '@/lib/actions/create-artist-bio-link-action';
import { deleteArtistBioImageAction } from '@/lib/actions/delete-artist-bio-image-action';
import { deleteArtistBioLinkAction } from '@/lib/actions/delete-artist-bio-link-action';
import { updateArtistBioImageAttributionAction } from '@/lib/actions/update-artist-bio-image-attribution-action';
import { queryKeys } from '@/lib/query-keys';

import {
  useCreateBioLinkMutation,
  useDeleteBioImageMutation,
  useDeleteBioLinkMutation,
  useUpdateBioImageAttributionMutation,
} from './use-bio-media-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/lib/actions/delete-artist-bio-link-action', () => ({
  deleteArtistBioLinkAction: vi.fn(),
}));

vi.mock('@/lib/actions/delete-artist-bio-image-action', () => ({
  deleteArtistBioImageAction: vi.fn(),
}));

vi.mock('@/lib/actions/update-artist-bio-image-attribution-action', () => ({
  updateArtistBioImageAttributionAction: vi.fn(),
}));

vi.mock('@/lib/actions/create-artist-bio-link-action', () => ({
  createArtistBioLinkAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

interface MutationOptions {
  mutationFn: (id: string) => Promise<unknown>;
  onSuccess: (result: { success: boolean; error?: string }) => void;
}

interface AttributionMutationOptions {
  mutationFn: (input: { imageId: string; attribution: string | null }) => Promise<unknown>;
  onSuccess: (result: { success: boolean; error?: string }) => void;
}

const getOptions = (renderFn: () => unknown): MutationOptions => {
  renderHook(renderFn);
  return useMutationMock.mock.calls.at(-1)?.[0] as MutationOptions;
};

const getAttributionOptions = (renderFn: () => unknown): AttributionMutationOptions => {
  renderHook(renderFn);
  return useMutationMock.mock.calls.at(-1)?.[0] as AttributionMutationOptions;
};

interface CreateLinkMutationOptions {
  mutationFn: (input: { artistId: string; label: string; url: string }) => Promise<unknown>;
  onSuccess: (result: { success: boolean; error?: string }) => void;
}

const getCreateLinkOptions = (renderFn: () => unknown): CreateLinkMutationOptions => {
  renderHook(renderFn);
  return useMutationMock.mock.calls.at(-1)?.[0] as CreateLinkMutationOptions;
};

beforeEach(() => {
  useMutationMock.mockReset();
  useMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  invalidateQueriesMock.mockClear();
});

describe('useDeleteBioLinkMutation', () => {
  it('calls deleteArtistBioLinkAction with the link id', async () => {
    vi.mocked(deleteArtistBioLinkAction).mockResolvedValue({ success: true });
    const opts = getOptions(() => useDeleteBioLinkMutation('artist-1'));

    await opts.mutationFn('l1');

    expect(deleteArtistBioLinkAction).toHaveBeenCalledWith('l1');
  });

  it('invalidates the bio-generation query after a link delete', () => {
    const opts = getOptions(() => useDeleteBioLinkMutation('artist-1'));

    opts.onSuccess({ success: true });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.artists.bioGeneration('artist-1'),
    });
  });

  it('surfaces a failed delete as an error toast', () => {
    const opts = getOptions(() => useDeleteBioLinkMutation('artist-1'));

    opts.onSuccess({ success: false, error: 'nope' });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('nope');
  });

  it('falls back to a generic message when the failure has no error', () => {
    const opts = getOptions(() => useDeleteBioLinkMutation('artist-1'));

    opts.onSuccess({ success: false });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to delete bio link');
  });

  it('does not invalidate the query on a failed delete', () => {
    const opts = getOptions(() => useDeleteBioLinkMutation('artist-1'));

    opts.onSuccess({ success: false, error: 'nope' });

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });

  it('exposes the pending state from the mutation', () => {
    useMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: true });

    const { result } = renderHook(() => useDeleteBioLinkMutation('artist-1'));

    expect(result.current.isDeletingBioLink).toBe(true);
  });
});

describe('useDeleteBioImageMutation', () => {
  it('calls deleteArtistBioImageAction with the image id', async () => {
    vi.mocked(deleteArtistBioImageAction).mockResolvedValue({ success: true });
    const opts = getOptions(() => useDeleteBioImageMutation('artist-1'));

    await opts.mutationFn('i1');

    expect(deleteArtistBioImageAction).toHaveBeenCalledWith('i1');
  });

  it('invalidates the bio-generation query after an image delete', () => {
    const opts = getOptions(() => useDeleteBioImageMutation('artist-1'));

    opts.onSuccess({ success: true });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.artists.bioGeneration('artist-1'),
    });
  });

  it('surfaces a failed delete as an error toast', () => {
    const opts = getOptions(() => useDeleteBioImageMutation('artist-1'));

    opts.onSuccess({ success: false, error: 'nope' });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('nope');
  });

  it('falls back to a generic message when the failure has no error', () => {
    const opts = getOptions(() => useDeleteBioImageMutation('artist-1'));

    opts.onSuccess({ success: false });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to delete bio image');
  });

  it('does not invalidate the query on a failed delete', () => {
    const opts = getOptions(() => useDeleteBioImageMutation('artist-1'));

    opts.onSuccess({ success: false, error: 'nope' });

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });

  it('exposes the pending state from the mutation', () => {
    useMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: true });

    const { result } = renderHook(() => useDeleteBioImageMutation('artist-1'));

    expect(result.current.isDeletingBioImage).toBe(true);
  });
});

describe('useCreateBioLinkMutation', () => {
  const linkInput = { artistId: 'artist-1', label: 'Official', url: 'https://example.com' };

  it('calls createArtistBioLinkAction with the input', async () => {
    vi.mocked(createArtistBioLinkAction).mockResolvedValue({ success: true });
    const opts = getCreateLinkOptions(() => useCreateBioLinkMutation('artist-1'));

    await opts.mutationFn(linkInput);

    expect(createArtistBioLinkAction).toHaveBeenCalledWith(linkInput);
  });

  it('invalidates the bio-generation query on success', () => {
    const opts = getCreateLinkOptions(() => useCreateBioLinkMutation('artist-1'));

    opts.onSuccess({ success: true });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.artists.bioGeneration('artist-1'),
    });
  });

  it('invokes the onCreated callback on success', () => {
    const onCreated = vi.fn();
    const opts = getCreateLinkOptions(() => useCreateBioLinkMutation('artist-1', onCreated));

    opts.onSuccess({ success: true });

    expect(onCreated).toHaveBeenCalled();
  });

  it('surfaces a failed create as an error toast', () => {
    const opts = getCreateLinkOptions(() => useCreateBioLinkMutation('artist-1'));

    opts.onSuccess({ success: false, error: 'nope' });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('nope');
  });

  it('falls back to a generic message when the failure has no error', () => {
    const opts = getCreateLinkOptions(() => useCreateBioLinkMutation('artist-1'));

    opts.onSuccess({ success: false });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to add bio link');
  });

  it('does not invalidate the query on a failed create', () => {
    const opts = getCreateLinkOptions(() => useCreateBioLinkMutation('artist-1'));

    opts.onSuccess({ success: false, error: 'nope' });

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });

  it('does not invoke onCreated on a failed create', () => {
    const onCreated = vi.fn();
    const opts = getCreateLinkOptions(() => useCreateBioLinkMutation('artist-1', onCreated));

    opts.onSuccess({ success: false });

    expect(onCreated).not.toHaveBeenCalled();
  });

  it('exposes the pending state from the mutation', () => {
    useMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: true });

    const { result } = renderHook(() => useCreateBioLinkMutation('artist-1'));

    expect(result.current.isCreatingBioLink).toBe(true);
  });
});

describe('useUpdateBioImageAttributionMutation', () => {
  it('calls updateArtistBioImageAttributionAction with the input', async () => {
    vi.mocked(updateArtistBioImageAttributionAction).mockResolvedValue({ success: true });
    const opts = getAttributionOptions(() => useUpdateBioImageAttributionMutation('artist-1'));

    await opts.mutationFn({ imageId: 'i1', attribution: 'Photo by Jane' });

    expect(updateArtistBioImageAttributionAction).toHaveBeenCalledWith({
      imageId: 'i1',
      attribution: 'Photo by Jane',
    });
  });

  it('invalidates the bio-generation query on success', () => {
    const opts = getAttributionOptions(() => useUpdateBioImageAttributionMutation('artist-1'));

    opts.onSuccess({ success: true });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.artists.bioGeneration('artist-1'),
    });
  });

  it('surfaces a failed update as an error toast', () => {
    const opts = getAttributionOptions(() => useUpdateBioImageAttributionMutation('artist-1'));

    opts.onSuccess({ success: false, error: 'x' });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('x');
  });

  it('falls back to a generic message when the failure has no error', () => {
    const opts = getAttributionOptions(() => useUpdateBioImageAttributionMutation('artist-1'));

    opts.onSuccess({ success: false });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to update attribution');
  });

  it('does not invalidate the query on a failed update', () => {
    const opts = getAttributionOptions(() => useUpdateBioImageAttributionMutation('artist-1'));

    opts.onSuccess({ success: false, error: 'x' });

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });

  it('exposes the pending state from the mutation', () => {
    useMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: true });

    const { result } = renderHook(() => useUpdateBioImageAttributionMutation('artist-1'));

    expect(result.current.isUpdatingBioImageAttribution).toBe(true);
  });
});
