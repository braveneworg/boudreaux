/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { addArtistImageSourceLinkAction } from '@/lib/actions/add-artist-image-source-link-action';
import { generateArtistImagesFromLinksAction } from '@/lib/actions/generate-artist-images-from-links-action';
import { removeArtistImageSourceLinkAction } from '@/lib/actions/remove-artist-image-source-link-action';
import { queryKeys } from '@/lib/query-keys';
import type { GenerateImagesFromLinksActionResult } from '@/lib/validation/image-links-schema';

interface UseAddImageSourceLinkMutationResult {
  /** Flags one URL as an image source for the artist. */
  addImageSourceLink: (url: string) => void;
  /** True while an add is in flight. */
  isAddingImageSourceLink: boolean;
}

interface UseRemoveImageSourceLinkMutationResult {
  /** Drops the image-source role from one of the artist's links, by row id. */
  removeImageSourceLink: (linkId: string) => void;
  /** True while a remove is in flight. */
  isRemovingImageSourceLink: boolean;
}

interface UseGenerateImagesFromLinksMutationResult {
  /** Triggers the images-from-links job; resolves with the action's typed result. */
  generateImagesFromLinksAsync: () => Promise<GenerateImagesFromLinksActionResult>;
  /** True while the trigger request is in flight (not the job itself). */
  isTriggeringImagesFromLinks: boolean;
}

/**
 * Mutation hook wrapping {@link addArtistImageSourceLinkAction}. A successful
 * add invalidates the artist's image-links query so the pill list refreshes
 * from the persisted rows; a failed result surfaces as an error toast.
 *
 * @param artistId - The artist whose image-links cache to invalidate.
 */
export const useAddImageSourceLinkMutation = (
  artistId: string
): UseAddImageSourceLinkMutationResult => {
  const queryClient = useQueryClient();
  const { mutate: addImageSourceLink, isPending: isAddingImageSourceLink } = useMutation({
    mutationFn: (url: string) => addArtistImageSourceLinkAction({ artistId, url }),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error ?? 'Failed to add link');
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.artists.imageLinks(artistId) });
    },
  });

  return { addImageSourceLink, isAddingImageSourceLink };
};

/**
 * Mutation hook wrapping {@link removeArtistImageSourceLinkAction}. See
 * {@link useAddImageSourceLinkMutation} for the invalidation/toast contract.
 *
 * @param artistId - The artist whose image-links cache to invalidate.
 */
export const useRemoveImageSourceLinkMutation = (
  artistId: string
): UseRemoveImageSourceLinkMutationResult => {
  const queryClient = useQueryClient();
  const { mutate: removeImageSourceLink, isPending: isRemovingImageSourceLink } = useMutation({
    mutationFn: (linkId: string) => removeArtistImageSourceLinkAction({ artistId, linkId }),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error ?? 'Failed to remove link');
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.artists.imageLinks(artistId) });
    },
  });

  return { removeImageSourceLink, isRemovingImageSourceLink };
};

/**
 * Mutation hook wrapping {@link generateArtistImagesFromLinksAction}. An
 * accepted trigger invalidates the image-links query so the poll picks up the
 * `pending` status immediately; the caller decides how to surface a rejection.
 *
 * @param artistId - The artist whose image-links cache to invalidate.
 */
export const useGenerateImagesFromLinksMutation = (
  artistId: string
): UseGenerateImagesFromLinksMutationResult => {
  const queryClient = useQueryClient();
  const { mutateAsync, isPending: isTriggeringImagesFromLinks } = useMutation({
    mutationFn: () => generateArtistImagesFromLinksAction({ artistId }),
    onSuccess: (result) => {
      if (!result.success) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.artists.imageLinks(artistId) });
    },
  });

  return { generateImagesFromLinksAsync: () => mutateAsync(), isTriggeringImagesFromLinks };
};
