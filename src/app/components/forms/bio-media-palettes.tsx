/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import { toast } from 'sonner';

import { buildBioFigureContent, buildBioLinkContent } from '@/app/components/ui/bio-editor-insert';
import { HttpError } from '@/lib/utils/fetch-and-parse';
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';
import type { BioStatusImage, BioStatusLink } from '@/lib/validation/bio-generation-schema';

import {
  useDeleteBioImageMutation,
  useDeleteBioLinkMutation,
  useSetDisplayImagesMutation,
  useUpdateBioImageAltMutation,
  useUpdateBioImageAttributionMutation,
} from './_hooks/mutations/use-bio-media-mutations';
import { useArtistBioGenerationStatusQuery } from './_hooks/use-artist-bio-generation-status-query';
import { useBioEditorRegistry } from './bio-editor-registry';
import { BioImageManager } from './bio-image-manager';
import { BioLinkPalette } from './bio-link-palette';

interface BioMediaPalettesProps {
  artistId: string;
}

/** Shown when an insert button is pressed while no bio editor holds the cursor. */
const NO_EDITOR_TARGET_COPY = 'Click into a bio editor first, then insert.';

const HTTP_TOO_MANY_REQUESTS = 429;

/**
 * Admin-facing reason for a failed status read. A 429 is the reverse proxy
 * (or the app) throttling a burst of admin navigation, so say that instead
 * of the generic fetch message; every other failure keeps its own message.
 * (`null` cannot happen once the query has settled in error, but the hook's
 * type allows it.)
 */
const describeStatusError = (error: Error | null): string => {
  if (error instanceof HttpError && error.status === HTTP_TOO_MANY_REQUESTS) {
    return 'the server is rate limiting requests, try again in a moment';
  }
  return error?.message ?? 'Unknown error';
};

/** The persisted media on a status response, empty until content exists. */
const contentMedia = (
  content: { links: BioStatusLink[]; images: BioStatusImage[] } | null | undefined
): { links: BioStatusLink[]; images: BioStatusImage[] } => ({
  links: content?.links ?? [],
  images: content?.images ?? [],
});

/**
 * The artist form's media rail: the discovered-links palette (only once the
 * artist has links) beside the bio image manager, which always mounts because
 * uploading is its job even when the pool is empty. Both are fed by the
 * persisted rows on the bio-generation status query — and when that read
 * fails outright the manager shows the failure with a Retry, never an empty
 * pool. Rendered directly above the bio editors so tiles drag straight in;
 * the Plus button on each tile inserts at the focused editor's cursor
 * (touch/keyboard path). While any mutation is pending every control is
 * disabled.
 *
 * @param artistId - The artist whose media to manage (edit mode only).
 */
export const BioMediaPalettes = ({ artistId }: BioMediaPalettesProps): JSX.Element => {
  const status = useArtistBioGenerationStatusQuery(artistId);
  const { deleteBioLink, isDeletingBioLink } = useDeleteBioLinkMutation(artistId);
  const { deleteBioImage, isDeletingBioImage } = useDeleteBioImageMutation(artistId);
  const { updateBioImageAttribution, isUpdatingBioImageAttribution } =
    useUpdateBioImageAttributionMutation(artistId);
  const { updateBioImageAlt, isUpdatingBioImageAlt } = useUpdateBioImageAltMutation(artistId);
  const { setDisplayImages, isSettingDisplayImages } = useSetDisplayImagesMutation(artistId);
  const registry = useBioEditorRegistry();

  const { links, images } = contentMedia(status.data?.content);
  // `isPending` is false once the query has settled in error with nothing
  // cached, so this is exactly the "failed, no data" state the manager shows.
  const loadError =
    !status.isPending && status.data === undefined ? describeStatusError(status.error) : null;

  const isMutating = [
    isDeletingBioLink,
    isDeletingBioImage,
    isUpdatingBioImageAttribution,
    isUpdatingBioImageAlt,
    isSettingDisplayImages,
  ].some(Boolean);

  const insertLink = (link: BioStatusLink): void => {
    const target = registry.getTarget();
    if (!target) {
      toast.info(NO_EDITOR_TARGET_COPY);
      return;
    }
    target
      .chain()
      .focus()
      .insertContent(
        buildBioLinkContent({
          label: link.label,
          url: link.url,
          kind: link.kind ?? null,
          isExternal: !isInternalBioUrl(link.url),
        })
      )
      .run();
  };

  const insertImage = (image: BioStatusImage): void => {
    const target = registry.getTarget();
    if (!target) {
      toast.info(NO_EDITOR_TARGET_COPY);
      return;
    }
    target
      .chain()
      .focus()
      .insertContent(
        buildBioFigureContent({
          url: image.url,
          thumbnailUrl: image.thumbnailUrl ?? null,
          title: image.title ?? null,
          attribution: image.attribution ?? null,
          alt: image.alt ?? image.title ?? 'Artist photo',
          width: image.width ?? null,
          height: image.height ?? null,
        })
      )
      .run();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
      {links.length > 0 && (
        <BioLinkPalette
          artistId={artistId}
          links={links}
          onDelete={deleteBioLink}
          onInsert={insertLink}
          disabled={isMutating}
        />
      )}
      <BioImageManager
        artistId={artistId}
        images={images}
        isLoading={status.isPending}
        loadError={loadError}
        onRetry={() => void status.refetch()}
        onDelete={deleteBioImage}
        onInsert={insertImage}
        onEditAttribution={(id, value) =>
          updateBioImageAttribution({ imageId: id, attribution: value })
        }
        onEditAlt={(id, value) => updateBioImageAlt({ imageId: id, alt: value })}
        onSetDisplayImages={setDisplayImages}
        // A new row is not in the cached status yet; refetch so it joins the pool.
        onUploaded={() => void status.refetch()}
        disabled={isMutating}
      />
    </div>
  );
};
