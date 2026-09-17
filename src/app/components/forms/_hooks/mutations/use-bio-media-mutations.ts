/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { createArtistBioLinkAction } from '@/lib/actions/create-artist-bio-link-action';
import { deleteArtistBioImageAction } from '@/lib/actions/delete-artist-bio-image-action';
import { deleteArtistBioLinkAction } from '@/lib/actions/delete-artist-bio-link-action';
import { setArtistDisplayImagesAction } from '@/lib/actions/set-artist-display-images-action';
import { updateArtistBioImageAltAction } from '@/lib/actions/update-artist-bio-image-alt-action';
import { updateArtistBioImageAttributionAction } from '@/lib/actions/update-artist-bio-image-attribution-action';
import { queryKeys } from '@/lib/query-keys';
import type { BioGenerationStatusResponse } from '@/lib/validation/bio-generation-schema';
import type { CreateBioLinkInput } from '@/lib/validation/bio-link-input-schema';

interface UseDeleteBioLinkMutationResult {
  /** Deletes one discovered bio link row by id. */
  deleteBioLink: (linkId: string) => void;
  /** True while a link delete is in flight. */
  isDeletingBioLink: boolean;
}

interface UseDeleteBioImageMutationResult {
  /** Deletes one discovered bio image row by id. */
  deleteBioImage: (imageId: string) => void;
  /** True while an image delete is in flight. */
  isDeletingBioImage: boolean;
}

/**
 * Mutation hook wrapping {@link deleteArtistBioLinkAction} for the admin bio
 * link palette. A successful delete invalidates the artist's bio-generation
 * status query so the palette refreshes from the persisted rows; a failed
 * result surfaces as an error toast.
 *
 * @param artistId - The artist whose bio-generation cache to invalidate.
 */
export const useDeleteBioLinkMutation = (artistId: string): UseDeleteBioLinkMutationResult => {
  const queryClient = useQueryClient();
  const { mutate: deleteBioLink, isPending: isDeletingBioLink } = useMutation({
    mutationFn: (linkId: string) => deleteArtistBioLinkAction(linkId),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error ?? 'Failed to delete bio link');
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.artists.bioGeneration(artistId),
      });
    },
  });

  return { deleteBioLink, isDeletingBioLink };
};

/**
 * Mutation hook wrapping {@link deleteArtistBioImageAction} for the admin bio
 * image palette. See {@link useDeleteBioLinkMutation} for the invalidation and
 * error-toast contract.
 *
 * @param artistId - The artist whose bio-generation cache to invalidate.
 */
export const useDeleteBioImageMutation = (artistId: string): UseDeleteBioImageMutationResult => {
  const queryClient = useQueryClient();
  const { mutate: deleteBioImage, isPending: isDeletingBioImage } = useMutation({
    mutationFn: (imageId: string) => deleteArtistBioImageAction(imageId),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error ?? 'Failed to delete bio image');
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.artists.bioGeneration(artistId),
      });
    },
  });

  return { deleteBioImage, isDeletingBioImage };
};

interface UseUpdateBioImageAttributionMutationResult {
  /** Persists an edited attribution for one bio image row. */
  updateBioImageAttribution: (input: { imageId: string; attribution: string | null }) => void;
  /** True while an attribution update is in flight. */
  isUpdatingBioImageAttribution: boolean;
}

/**
 * Mutation hook wrapping {@link updateArtistBioImageAttributionAction} for the
 * admin bio image palette's inline attribution editor. On success invalidates
 * the artist's bio-generation status query so the palette (and RTE picker)
 * reflect the new value; a failed result surfaces as an error toast.
 *
 * @param artistId - The artist whose bio-generation cache to invalidate.
 */
export const useUpdateBioImageAttributionMutation = (
  artistId: string
): UseUpdateBioImageAttributionMutationResult => {
  const queryClient = useQueryClient();
  const { mutate: updateBioImageAttribution, isPending: isUpdatingBioImageAttribution } =
    useMutation({
      mutationFn: (input: { imageId: string; attribution: string | null }) =>
        updateArtistBioImageAttributionAction(input),
      onSuccess: (result) => {
        if (!result.success) {
          toast.error(result.error ?? 'Failed to update attribution');
          return;
        }
        void queryClient.invalidateQueries({
          queryKey: queryKeys.artists.bioGeneration(artistId),
        });
      },
    });

  return { updateBioImageAttribution, isUpdatingBioImageAttribution };
};

interface UseUpdateBioImageAltMutationResult {
  /** Persists an edited alt text for one bio image row. */
  updateBioImageAlt: (input: { imageId: string; alt: string | null }) => void;
  /** True while an alt update is in flight. */
  isUpdatingBioImageAlt: boolean;
}

/**
 * Mutation hook wrapping {@link updateArtistBioImageAltAction} for the media
 * manager's inline alt editor — the text a display image needs before it can
 * be chosen. On success invalidates the artist's bio-generation status query
 * so the tile's eligibility updates; a failed result surfaces as an error
 * toast.
 *
 * @param artistId - The artist whose bio-generation cache to invalidate.
 */
export const useUpdateBioImageAltMutation = (
  artistId: string
): UseUpdateBioImageAltMutationResult => {
  const queryClient = useQueryClient();
  const { mutate: updateBioImageAlt, isPending: isUpdatingBioImageAlt } = useMutation({
    mutationFn: (input: { imageId: string; alt: string | null }) =>
      updateArtistBioImageAltAction(input),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error ?? 'Failed to update alt text');
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.artists.bioGeneration(artistId),
      });
    },
  });

  return { updateBioImageAlt, isUpdatingBioImageAlt };
};

/**
 * Project a display-image choice onto a cached bio-generation status, the way
 * the repository will persist it: each chosen image takes its index as
 * `displayOrder` and becomes `custom`, every other image is cleared. A status
 * without content is returned as is.
 */
export const applyDisplayImagesToStatus = (
  status: BioGenerationStatusResponse,
  imageIds: string[]
): BioGenerationStatusResponse => {
  if (!status.content) return status;
  return {
    ...status,
    content: {
      ...status.content,
      images: status.content.images.map((image) => {
        const position = image.id === undefined ? -1 : imageIds.indexOf(image.id);
        return position === -1
          ? { ...image, displayOrder: null }
          : { ...image, displayOrder: position, origin: 'custom' };
      }),
    },
  };
};

interface SetDisplayImagesContext {
  previous: BioGenerationStatusResponse | undefined;
}

interface UseSetDisplayImagesMutationResult {
  /** Replaces the artist's display images with the given ordered ids. */
  setDisplayImages: (imageIds: string[]) => void;
  /** True while a display-image write is in flight. */
  isSettingDisplayImages: boolean;
}

const SET_DISPLAY_IMAGES_FAILURE = 'Failed to update display images';

/**
 * Mutation hook wrapping {@link setArtistDisplayImagesAction} for the media
 * manager's chosen strip and "use as display image" buttons. The chosen set is
 * written optimistically into the artist's cached bio-generation status (the
 * manager's source of truth) so a reorder feels immediate, rolled back with a
 * toast when the server refuses or the call fails, and both the status query
 * and the cover-art picker pool are invalidated once the write settles.
 *
 * @param artistId - The artist whose display images the mutation writes.
 */
export const useSetDisplayImagesMutation = (
  artistId: string
): UseSetDisplayImagesMutationResult => {
  const queryClient = useQueryClient();
  const statusKey = queryKeys.artists.bioGeneration(artistId);

  const rollback = (context: SetDisplayImagesContext | undefined): void => {
    if (context?.previous) {
      queryClient.setQueryData(statusKey, context.previous);
    }
  };

  const { mutate: setDisplayImages, isPending: isSettingDisplayImages } = useMutation({
    mutationFn: (imageIds: string[]) => setArtistDisplayImagesAction({ artistId, imageIds }),
    onMutate: async (imageIds): Promise<SetDisplayImagesContext> => {
      await queryClient.cancelQueries({ queryKey: statusKey });
      const previous = queryClient.getQueryData<BioGenerationStatusResponse>(statusKey);
      if (previous?.content) {
        queryClient.setQueryData(statusKey, applyDisplayImagesToStatus(previous, imageIds));
      }
      return { previous };
    },
    onSuccess: (result, _imageIds, context) => {
      if (!result.success) {
        rollback(context);
        toast.error(result.error ?? SET_DISPLAY_IMAGES_FAILURE);
      }
    },
    onError: (_error, _imageIds, context) => {
      rollback(context);
      toast.error(SET_DISPLAY_IMAGES_FAILURE);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: statusKey });
      void queryClient.invalidateQueries({ queryKey: queryKeys.artists.bioImages(artistId) });
    },
  });

  return { setDisplayImages, isSettingDisplayImages };
};

interface UseCreateBioLinkMutationResult {
  /** Persists one admin-authored custom bio link. */
  createBioLink: (input: CreateBioLinkInput) => void;
  /** True while a link create is in flight. */
  isCreatingBioLink: boolean;
}

/**
 * Mutation hook wrapping {@link createArtistBioLinkAction} for the admin custom
 * link editor. On success it invalidates the artist's bio-generation status
 * query so the palette shows the new row, then runs the optional `onCreated`
 * callback (used to clear the editor fields); a failed result surfaces as an
 * error toast and leaves the form untouched.
 *
 * @param artistId - The artist whose bio-generation cache to invalidate.
 * @param onCreated - Optional callback fired only after a successful create.
 */
export const useCreateBioLinkMutation = (
  artistId: string,
  onCreated?: () => void
): UseCreateBioLinkMutationResult => {
  const queryClient = useQueryClient();
  const { mutate: createBioLink, isPending: isCreatingBioLink } = useMutation({
    mutationFn: (input: CreateBioLinkInput) => createArtistBioLinkAction(input),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error ?? 'Failed to add bio link');
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.artists.bioGeneration(artistId),
      });
      onCreated?.();
    },
  });

  return { createBioLink, isCreatingBioLink };
};
