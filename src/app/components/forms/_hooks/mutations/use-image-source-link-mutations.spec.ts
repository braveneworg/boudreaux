// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';
import { toast } from 'sonner';

import { addArtistImageSourceLinkAction } from '@/lib/actions/add-artist-image-source-link-action';
import { generateArtistImagesFromLinksAction } from '@/lib/actions/generate-artist-images-from-links-action';
import { removeArtistImageSourceLinkAction } from '@/lib/actions/remove-artist-image-source-link-action';

import {
  useAddImageSourceLinkMutation,
  useGenerateImagesFromLinksMutation,
  useRemoveImageSourceLinkMutation,
} from './use-image-source-link-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/lib/actions/add-artist-image-source-link-action', () => ({
  addArtistImageSourceLinkAction: vi.fn(),
}));
vi.mock('@/lib/actions/remove-artist-image-source-link-action', () => ({
  removeArtistImageSourceLinkAction: vi.fn(),
}));
vi.mock('@/lib/actions/generate-artist-images-from-links-action', () => ({
  generateArtistImagesFromLinksAction: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

interface MutationOptions<TResult, TInput> {
  mutationFn: (input: TInput) => Promise<TResult>;
  onSuccess?: (result: TResult) => void;
}

const optionsOf = <TResult, TInput>(): MutationOptions<TResult, TInput> =>
  useMutationMock.mock.calls[0]?.[0] as MutationOptions<TResult, TInput>;

const IMAGE_LINKS_KEY = { queryKey: ['artists', 'imageLinks', 'artist-1'] };

beforeEach(() => {
  useMutationMock.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
});

describe('useAddImageSourceLinkMutation', () => {
  it('calls the add action with the artist id and url', async () => {
    renderHook(() => useAddImageSourceLinkMutation('artist-1'));

    await optionsOf<unknown, string>().mutationFn('https://x.test/p');

    expect(vi.mocked(addArtistImageSourceLinkAction).mock.calls).toEqual([
      [{ artistId: 'artist-1', url: 'https://x.test/p' }],
    ]);
  });

  it('invalidates the image-links query on success', () => {
    renderHook(() => useAddImageSourceLinkMutation('artist-1'));

    optionsOf<{ success: boolean }, string>().onSuccess?.({ success: true });

    expect(invalidateQueriesMock).toHaveBeenCalledWith(IMAGE_LINKS_KEY);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('toasts the action error and does not invalidate on a failed result', () => {
    renderHook(() => useAddImageSourceLinkMutation('artist-1'));

    optionsOf<{ success: boolean; error?: string }, string>().onSuccess?.({
      success: false,
      error: 'Artist not found',
    });

    expect(toast.error).toHaveBeenCalledWith('Artist not found');
    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the failed result has no error', () => {
    renderHook(() => useAddImageSourceLinkMutation('artist-1'));

    optionsOf<{ success: boolean }, string>().onSuccess?.({ success: false });

    expect(toast.error).toHaveBeenCalledWith('Failed to add link');
  });
});

describe('useRemoveImageSourceLinkMutation', () => {
  it('calls the remove action with the artist and link ids', async () => {
    renderHook(() => useRemoveImageSourceLinkMutation('artist-1'));

    await optionsOf<unknown, string>().mutationFn('link-1');

    expect(vi.mocked(removeArtistImageSourceLinkAction).mock.calls).toEqual([
      [{ artistId: 'artist-1', linkId: 'link-1' }],
    ]);
  });

  it('invalidates on success and toasts on failure', () => {
    renderHook(() => useRemoveImageSourceLinkMutation('artist-1'));
    const { onSuccess } = optionsOf<{ success: boolean; error?: string }, string>();

    onSuccess?.({ success: true });
    onSuccess?.({ success: false });

    expect(invalidateQueriesMock.mock.calls).toEqual([[IMAGE_LINKS_KEY]]);
    expect(toast.error).toHaveBeenCalledWith('Failed to remove link');
  });
});

describe('useGenerateImagesFromLinksMutation', () => {
  it('calls the trigger action with the artist id', async () => {
    renderHook(() => useGenerateImagesFromLinksMutation('artist-1'));

    await optionsOf<unknown, void>().mutationFn();

    expect(vi.mocked(generateArtistImagesFromLinksAction).mock.calls).toEqual([
      [{ artistId: 'artist-1' }],
    ]);
  });

  it('invalidates the image-links query only when the trigger was accepted', () => {
    renderHook(() => useGenerateImagesFromLinksMutation('artist-1'));
    const { onSuccess } = optionsOf<{ success: boolean }, void>();

    onSuccess?.({ success: false });
    expect(invalidateQueriesMock).not.toHaveBeenCalled();

    onSuccess?.({ success: true });
    expect(invalidateQueriesMock.mock.calls).toEqual([[IMAGE_LINKS_KEY]]);
  });

  it('exposes mutateAsync as generateImagesFromLinksAsync', async () => {
    const mutateAsync = vi.fn(async () => ({ success: true, status: 'pending' }));
    useMutationMock.mockReturnValueOnce({ mutate: vi.fn(), mutateAsync, isPending: true });

    const { result } = renderHook(() => useGenerateImagesFromLinksMutation('artist-1'));

    await expect(result.current.generateImagesFromLinksAsync()).resolves.toEqual({
      success: true,
      status: 'pending',
    });
    expect(result.current.isTriggeringImagesFromLinks).toBe(true);
  });
});
