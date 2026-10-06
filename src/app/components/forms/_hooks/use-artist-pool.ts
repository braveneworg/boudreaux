/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { createArtistBioLinkAction } from '@/lib/actions/create-artist-bio-link-action';
import { deleteArtistBioImageAction } from '@/lib/actions/delete-artist-bio-image-action';
import { deleteArtistBioLinkAction } from '@/lib/actions/delete-artist-bio-link-action';
import { setArtistDisplayImagesAction } from '@/lib/actions/set-artist-display-images-action';
import { updateArtistBioImageAltAction } from '@/lib/actions/update-artist-bio-image-alt-action';
import { updateArtistBioImageAttributionAction } from '@/lib/actions/update-artist-bio-image-attribution-action';
import { queryKeys } from '@/lib/query-keys';
import type { ArtistBioImageRecord, ArtistBioLinkRecord } from '@/lib/types/domain/artist';
import {
  chosenDisplayImageIds,
  decideUploadJoin,
  type DisplayImageSet,
  resolveDisplayImageSet,
} from '@/lib/utils/display-images';
import { HttpError } from '@/lib/utils/fetch-and-parse';
import type {
  BioGenerationStatusResponse,
  BioStatusImage,
  BioStatusLink,
} from '@/lib/validation/bio-generation-schema';
import type { CreateBioLinkInput } from '@/lib/validation/bio-link-input-schema';

import { useArtistBioGenerationStatusQuery } from './use-artist-bio-generation-status-query';
import { uploadBioImage } from '../utils/upload-bio-image';

/** Image types the presign step accepts for artist bio images. */
export const BIO_IMAGE_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Presign rejects larger images; mirrored in the zone's hint so it is honest. */
export const MAX_BIO_IMAGE_SIZE_MB = 50;

const WRONG_TYPE_MESSAGE = 'Choose a JPEG, PNG, or WebP image.';
const GENERIC_UPLOAD_FAILURE = 'Failed to upload image';
const SET_DISPLAY_IMAGES_FAILURE = 'Failed to update display images';
const HTTP_TOO_MANY_REQUESTS = 429;

/** What the admin entered alongside an upload; a blank alt gets the artist's name server-side. */
export interface BioImageUploadFields {
  alt: string | null;
  attribution: string;
  /** Caption/title, from the bio editor's upload dialog. */
  title?: string | null;
}

export interface ArtistPool {
  /** The whole pool, in pool order; empty until loaded. */
  images: BioStatusImage[];
  /** The persisted bio links (reference role); empty until loaded. */
  links: BioStatusLink[];
  /** True while the pool is still loading for the first time. */
  isPending: boolean;
  /** Why the pool could not be read, phrased for the admin, or null. */
  loadError: string | null;
  /** Re-requests the pool after a load failure. */
  retry: () => void;
  /** The chosen display-image ids, in order. */
  chosenIds: string[];
  /** What the public page shows right now, with the tier it came from. */
  shown: DisplayImageSet<BioStatusImage>;
  /**
   * Uploads one file into the pool and leaves the chosen set alone — the bio
   * editor's inline upload, which exists to place an image in the prose.
   * Resolves the persisted row, or null when the upload failed (the reason
   * is in `addError`).
   */
  add: (file: File, fields: BioImageUploadFields) => Promise<ArtistBioImageRecord | null>;
  /**
   * Uploads one file into the pool and appends it to the display images —
   * the media manager's upload zone and strip drop. The join is decided
   * against the set as it is when the upload lands; a blank alt is
   * backfilled with the artist's name by the set action. Resolves like
   * {@link ArtistPool.add}.
   */
  addAsDisplayImage: (
    file: File,
    fields: BioImageUploadFields
  ) => Promise<ArtistBioImageRecord | null>;
  isAdding: boolean;
  addError: string | null;
  /** Replaces the chosen set with these ordered ids (reorder, drop, choose). */
  setDisplayImages: (imageIds: string[]) => void;
  choose: (imageId: string) => void;
  unchoose: (imageId: string) => void;
  remove: (imageId: string) => void;
  setAlt: (imageId: string, alt: string | null) => void;
  setAttribution: (imageId: string, attribution: string | null) => void;
  removeLink: (linkId: string) => void;
  /** Persists one admin-authored link; resolves the row, or null on failure (toasted). */
  addLink: (input: CreateBioLinkInput) => Promise<ArtistBioLinkRecord | null>;
  /** True while any pool write — an upload included — is in flight. */
  isMutating: boolean;
}

/**
 * One pool, two keys: the bio-generation status (the manager's source of
 * truth, carrying the pool) and the cover-art picker's per-artist pool read.
 * Every pool write marks both stale here, so no writer can forget one.
 */
export const invalidateArtistPool = (queryClient: QueryClient, artistId: string): void => {
  void queryClient.invalidateQueries({ queryKey: queryKeys.artists.bioGeneration(artistId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.artists.bioImages(artistId) });
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

/**
 * Admin-facing reason for a failed status read. A 429 is the reverse proxy
 * (or the app) throttling a burst of admin navigation, so say that instead
 * of the generic fetch message; every other failure keeps its own message.
 */
const describeLoadError = (error: Error | null): string => {
  if (error instanceof HttpError && error.status === HTTP_TOO_MANY_REQUESTS) {
    return 'the server is rate limiting requests, try again in a moment';
  }
  return error?.message ?? 'Unknown error';
};

interface SetDisplayImagesContext {
  previous: BioGenerationStatusResponse | undefined;
}

/** The display-set write: optimistic in the cached status, rolled back with a toast on refusal. */
const useSetDisplayImagesWrite = (artistId: string) => {
  const queryClient = useQueryClient();
  const statusKey = queryKeys.artists.bioGeneration(artistId);

  const rollback = (context: SetDisplayImagesContext | undefined): void => {
    if (context?.previous) queryClient.setQueryData(statusKey, context.previous);
  };

  return useMutation({
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
    onSettled: () => invalidateArtistPool(queryClient, artistId),
  });
};

/** A pool write that only reports failure and marks the pool stale on success. */
const usePoolWrite = <TInput>(
  artistId: string,
  run: (input: TInput) => Promise<{ success: boolean; error?: string }>,
  failure: string
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error ?? failure);
        return;
      }
      invalidateArtistPool(queryClient, artistId);
    },
  });
};

/** Every pool write, each with its failure copy. */
const usePoolWrites = (artistId: string) => {
  const queryClient = useQueryClient();
  const setDisplay = useSetDisplayImagesWrite(artistId);
  const removeImage = usePoolWrite(
    artistId,
    (imageId: string) => deleteArtistBioImageAction(imageId),
    'Failed to delete bio image'
  );
  const alt = usePoolWrite(
    artistId,
    (input: { imageId: string; alt: string | null }) => updateArtistBioImageAltAction(input),
    'Failed to update alt text'
  );
  const attribution = usePoolWrite(
    artistId,
    (input: { imageId: string; attribution: string | null }) =>
      updateArtistBioImageAttributionAction(input),
    'Failed to update attribution'
  );
  const removeLink = usePoolWrite(
    artistId,
    (linkId: string) => deleteArtistBioLinkAction(linkId),
    'Failed to delete bio link'
  );
  const addLink = useMutation({
    mutationFn: (input: CreateBioLinkInput) => createArtistBioLinkAction(input),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error ?? 'Failed to add bio link');
        return;
      }
      invalidateArtistPool(queryClient, artistId);
    },
  });

  return {
    setDisplayImages: setDisplay.mutate,
    removeImage: removeImage.mutate,
    setAlt: alt.mutate,
    setAttribution: attribution.mutate,
    removeLink: removeLink.mutate,
    addLinkAsync: addLink.mutateAsync,
    isWriting: [
      setDisplay.isPending,
      removeImage.isPending,
      alt.isPending,
      attribution.isPending,
      removeLink.isPending,
      addLink.isPending,
    ].some(Boolean),
  };
};

/** The chosen ids as the cache holds them NOW — not as a closure captured them. */
const useCurrentChosenIds = (artistId: string): (() => string[]) => {
  const queryClient = useQueryClient();
  const statusKey = queryKeys.artists.bioGeneration(artistId);
  return useCallback(
    () =>
      chosenDisplayImageIds(
        queryClient.getQueryData<BioGenerationStatusResponse>(statusKey)?.content?.images ?? []
      ),
    [queryClient, statusKey]
  );
};

/**
 * Uploads into the pool. Once the row exists the pool is re-read; a manager
 * upload (`addAsDisplayImage`) then joins the display images, decided
 * against the set as it is at that moment, not as it was when the upload
 * started. A bio-editor upload (`add`) only refreshes the picker pool.
 */
const useAddToPool = (artistId: string, setDisplayImages: (imageIds: string[]) => void) => {
  const queryClient = useQueryClient();
  const statusKey = queryKeys.artists.bioGeneration(artistId);
  const currentChosenIds = useCurrentChosenIds(artistId);
  const [uploadsInFlight, setUploadsInFlight] = useState(0);
  const [addError, setAddError] = useState<string | null>(null);

  const upload = useCallback(
    async (
      file: File,
      fields: BioImageUploadFields,
      onLanded: (uploadedId: string) => void
    ): Promise<ArtistBioImageRecord | null> => {
      if (!(BIO_IMAGE_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
        setAddError(WRONG_TYPE_MESSAGE);
        return null;
      }
      setAddError(null);
      setUploadsInFlight((count) => count + 1);
      try {
        const result = await uploadBioImage(file, { artistId, ...fields });
        if (!result.success || !result.data) {
          setAddError(result.error ?? GENERIC_UPLOAD_FAILURE);
          return null;
        }
        await queryClient.invalidateQueries({ queryKey: statusKey });
        onLanded(result.data.id);
        return result.data;
      } finally {
        setUploadsInFlight((count) => count - 1);
      }
    },
    [artistId, queryClient, statusKey]
  );

  const refreshPickerPool = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: queryKeys.artists.bioImages(artistId) }),
    [artistId, queryClient]
  );

  const add = useCallback(
    (file: File, fields: BioImageUploadFields) => upload(file, fields, refreshPickerPool),
    [upload, refreshPickerPool]
  );

  const addAsDisplayImage = useCallback(
    (file: File, fields: BioImageUploadFields) =>
      upload(file, fields, (uploadedId) => {
        const joined = decideUploadJoin(currentChosenIds(), uploadedId);
        if (joined) {
          setDisplayImages(joined);
        } else {
          refreshPickerPool();
        }
      }),
    [upload, currentChosenIds, setDisplayImages, refreshPickerPool]
  );

  return { add, addAsDisplayImage, isAdding: uploadsInFlight > 0, addError };
};

/**
 * An artist's bio image pool and its display images (the Shown set) as one
 * client module: the read, the chosen set and what the page shows, every
 * write, the optimistic choice with rollback, and the one invalidation policy
 * for both pool keys. The media manager, the upload zone, the display strip,
 * the bio editors' image picker and the link palette render it; none keeps a
 * copy of the pool or decides on its own what joins the set.
 *
 * @param artistId - The artist whose pool to manage (edit mode only).
 */
export const useArtistPool = (artistId: string): ArtistPool => {
  const status = useArtistBioGenerationStatusQuery(artistId);
  const writes = usePoolWrites(artistId);
  const { setDisplayImages, addLinkAsync } = writes;
  const currentChosenIds = useCurrentChosenIds(artistId);
  const { add, addAsDisplayImage, isAdding, addError } = useAddToPool(artistId, setDisplayImages);

  const images = status.data?.content?.images ?? [];
  const links = status.data?.content?.links ?? [];

  const addLink = useCallback(
    async (input: CreateBioLinkInput): Promise<ArtistBioLinkRecord | null> => {
      const result = await addLinkAsync(input);
      return result.success && result.data ? result.data : null;
    },
    [addLinkAsync]
  );

  return {
    images,
    links,
    isPending: status.isPending,
    // `isPending` is false once the query has settled in error with nothing
    // cached, so this is exactly the "failed, no data" state.
    loadError:
      !status.isPending && status.data === undefined ? describeLoadError(status.error) : null,
    retry: () => void status.refetch(),
    chosenIds: chosenDisplayImageIds(images),
    shown: resolveDisplayImageSet(images),
    add,
    addAsDisplayImage,
    isAdding,
    addError,
    setDisplayImages,
    choose: (imageId) => setDisplayImages([...currentChosenIds(), imageId]),
    unchoose: (imageId) => setDisplayImages(currentChosenIds().filter((id) => id !== imageId)),
    remove: writes.removeImage,
    setAlt: (imageId, value) => writes.setAlt({ imageId, alt: value }),
    setAttribution: (imageId, value) => writes.setAttribution({ imageId, attribution: value }),
    removeLink: writes.removeLink,
    addLink,
    isMutating: isAdding || writes.isWriting,
  };
};
