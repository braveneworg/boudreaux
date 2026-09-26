// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';
import { toast } from 'sonner';

import { createArtistBioLinkAction } from '@/lib/actions/create-artist-bio-link-action';
import { deleteArtistBioImageAction } from '@/lib/actions/delete-artist-bio-image-action';
import { deleteArtistBioLinkAction } from '@/lib/actions/delete-artist-bio-link-action';
import { setArtistDisplayImagesAction } from '@/lib/actions/set-artist-display-images-action';
import { updateArtistBioImageAltAction } from '@/lib/actions/update-artist-bio-image-alt-action';
import { updateArtistBioImageAttributionAction } from '@/lib/actions/update-artist-bio-image-attribution-action';
import { queryKeys } from '@/lib/query-keys';
import type { BioGenerationStatusResponse } from '@/lib/validation/bio-generation-schema';

import {
  applyDisplayImagesToStatus,
  useCreateBioLinkMutation,
  useDeleteBioImageMutation,
  useDeleteBioLinkMutation,
  useSetDisplayImagesMutation,
  useUpdateBioImageAltMutation,
  useUpdateBioImageAttributionMutation,
} from './use-bio-media-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const cancelQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const getQueryDataMock = vi.hoisted(() => vi.fn());
const setQueryDataMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
    cancelQueries: cancelQueriesMock,
    getQueryData: getQueryDataMock,
    setQueryData: setQueryDataMock,
  }),
}));

vi.mock('@/lib/actions/set-artist-display-images-action', () => ({
  setArtistDisplayImagesAction: vi.fn(),
}));

vi.mock('@/lib/actions/update-artist-bio-image-alt-action', () => ({
  updateArtistBioImageAltAction: vi.fn(),
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
  cancelQueriesMock.mockClear();
  getQueryDataMock.mockReset();
  setQueryDataMock.mockClear();
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

interface AltMutationOptions {
  mutationFn: (input: { imageId: string; alt: string | null }) => Promise<unknown>;
  onSuccess: (result: { success: boolean; error?: string }) => void;
}

const getAltOptions = (renderFn: () => unknown): AltMutationOptions => {
  renderHook(renderFn);
  return useMutationMock.mock.calls.at(-1)?.[0] as AltMutationOptions;
};

describe('useUpdateBioImageAltMutation', () => {
  it('calls updateArtistBioImageAltAction with the input', async () => {
    vi.mocked(updateArtistBioImageAltAction).mockResolvedValue({ success: true });
    const opts = getAltOptions(() => useUpdateBioImageAltMutation('artist-1'));

    await opts.mutationFn({ imageId: 'i1', alt: 'Ceschi on stage' });

    expect(updateArtistBioImageAltAction).toHaveBeenCalledWith({
      imageId: 'i1',
      alt: 'Ceschi on stage',
    });
  });

  it('invalidates the bio-generation query after an alt update', () => {
    const opts = getAltOptions(() => useUpdateBioImageAltMutation('artist-1'));

    opts.onSuccess({ success: true });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.artists.bioGeneration('artist-1'),
    });
  });

  it('surfaces a failed update as an error toast without invalidating', () => {
    const opts = getAltOptions(() => useUpdateBioImageAltMutation('artist-1'));

    opts.onSuccess({ success: false, error: 'x' });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('x');
    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the failure has no error', () => {
    const opts = getAltOptions(() => useUpdateBioImageAltMutation('artist-1'));

    opts.onSuccess({ success: false });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to update alt text');
  });

  it('exposes the pending state from the mutation', () => {
    useMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: true });

    const { result } = renderHook(() => useUpdateBioImageAltMutation('artist-1'));

    expect(result.current.isUpdatingBioImageAlt).toBe(true);
  });
});

const statusImage = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  url: `https://cdn/${id}.webp`,
  attribution: null,
  isPrimary: false,
  displayOrder: null,
  origin: 'generated' as const,
  ...overrides,
});

const statusWith = (images: ReturnType<typeof statusImage>[]): BioGenerationStatusResponse => ({
  status: 'succeeded',
  error: null,
  content: {
    shortBio: '',
    longBio: '',
    altBio: '',
    genres: null,
    images,
    links: [],
    model: 'm',
  },
});

describe('applyDisplayImagesToStatus', () => {
  it('assigns each chosen image its index and clears the rest', () => {
    const status = statusWith([
      statusImage('a', { displayOrder: 0 }),
      statusImage('b'),
      statusImage('c'),
    ]);

    const next = applyDisplayImagesToStatus(status, ['c', 'b']);

    expect(next.content?.images.map(({ id, displayOrder }) => [id, displayOrder])).toEqual([
      ['a', null],
      ['b', 1],
      ['c', 0],
    ]);
  });

  it('marks every chosen image custom, as the repository will', () => {
    const status = statusWith([statusImage('a'), statusImage('b', { origin: 'custom' })]);

    const next = applyDisplayImagesToStatus(status, ['a']);

    expect(next.content?.images.map(({ origin }) => origin)).toEqual(['custom', 'custom']);
  });

  it('leaves a status without content untouched', () => {
    const status: BioGenerationStatusResponse = { status: 'pending', error: null, content: null };

    expect(applyDisplayImagesToStatus(status, ['a'])).toBe(status);
  });
});

interface DisplayImagesMutationOptions {
  mutationFn: (imageIds: string[]) => Promise<unknown>;
  onMutate: (imageIds: string[]) => Promise<{ previous: BioGenerationStatusResponse | undefined }>;
  onSuccess: (
    result: { success: boolean; error?: string },
    imageIds: string[],
    context: { previous: BioGenerationStatusResponse | undefined } | undefined
  ) => void;
  onError: (
    error: Error,
    imageIds: string[],
    context: { previous: BioGenerationStatusResponse | undefined } | undefined
  ) => void;
  onSettled: () => void;
}

const getDisplayImagesOptions = (renderFn: () => unknown): DisplayImagesMutationOptions => {
  renderHook(renderFn);
  return useMutationMock.mock.calls.at(-1)?.[0] as DisplayImagesMutationOptions;
};

describe('useSetDisplayImagesMutation', () => {
  const key = queryKeys.artists.bioGeneration('artist-1');

  it('calls setArtistDisplayImagesAction with the artist and the ordered ids', async () => {
    vi.mocked(setArtistDisplayImagesAction).mockResolvedValue({ success: true });
    const opts = getDisplayImagesOptions(() => useSetDisplayImagesMutation('artist-1'));

    await opts.mutationFn(['b', 'a']);

    expect(setArtistDisplayImagesAction).toHaveBeenCalledWith({
      artistId: 'artist-1',
      imageIds: ['b', 'a'],
    });
  });

  it('cancels in-flight status fetches and writes the choice optimistically', async () => {
    const previous = statusWith([statusImage('a'), statusImage('b')]);
    getQueryDataMock.mockReturnValue(previous);
    const opts = getDisplayImagesOptions(() => useSetDisplayImagesMutation('artist-1'));

    const context = await opts.onMutate(['b']);

    expect(cancelQueriesMock).toHaveBeenCalledWith({ queryKey: key });
    expect(context).toEqual({ previous });
    expect(setQueryDataMock).toHaveBeenCalledWith(
      key,
      expect.objectContaining({
        content: expect.objectContaining({
          images: [
            expect.objectContaining({ id: 'a', displayOrder: null }),
            expect.objectContaining({ id: 'b', displayOrder: 0, origin: 'custom' }),
          ],
        }),
      })
    );
  });

  it('writes nothing optimistically when the status is not cached yet', async () => {
    getQueryDataMock.mockReturnValue(undefined);
    const opts = getDisplayImagesOptions(() => useSetDisplayImagesMutation('artist-1'));

    const context = await opts.onMutate(['b']);

    expect(context).toEqual({ previous: undefined });
    expect(setQueryDataMock).not.toHaveBeenCalled();
  });

  it('rolls back and toasts when the server refuses the set', () => {
    const previous = statusWith([statusImage('a')]);
    const opts = getDisplayImagesOptions(() => useSetDisplayImagesMutation('artist-1'));

    opts.onSuccess({ success: false, error: 'Add alt text first' }, ['a'], { previous });

    expect(setQueryDataMock).toHaveBeenCalledWith(key, previous);
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Add alt text first');
  });

  it('falls back to a generic message when the refusal has no error', () => {
    const opts = getDisplayImagesOptions(() => useSetDisplayImagesMutation('artist-1'));

    opts.onSuccess({ success: false }, ['a'], { previous: undefined });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to update display images');
  });

  it('keeps the optimistic state and stays silent when the server accepts', () => {
    const opts = getDisplayImagesOptions(() => useSetDisplayImagesMutation('artist-1'));

    opts.onSuccess({ success: true }, ['a'], { previous: statusWith([]) });

    expect(setQueryDataMock).not.toHaveBeenCalled();
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it('rolls back and toasts when the action throws', () => {
    const previous = statusWith([statusImage('a')]);
    const opts = getDisplayImagesOptions(() => useSetDisplayImagesMutation('artist-1'));

    opts.onError(new Error('network'), ['a'], { previous });

    expect(setQueryDataMock).toHaveBeenCalledWith(key, previous);
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to update display images');
  });

  it('invalidates the status query and the picker pool once settled', () => {
    const opts = getDisplayImagesOptions(() => useSetDisplayImagesMutation('artist-1'));

    opts.onSettled();

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: key });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.artists.bioImages('artist-1'),
    });
  });

  it('exposes the pending state from the mutation', () => {
    useMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: true });

    const { result } = renderHook(() => useSetDisplayImagesMutation('artist-1'));

    expect(result.current.isSettingDisplayImages).toBe(true);
  });
});
