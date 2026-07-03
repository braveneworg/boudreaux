/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { deleteArtistBioImageAction } from '@/lib/actions/delete-artist-bio-image-action';
import { deleteArtistBioLinkAction } from '@/lib/actions/delete-artist-bio-link-action';
import { queryKeys } from '@/lib/query-keys';

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
