/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import { buildBioFigureContent, buildBioLinkContent } from '@/app/components/ui/bio-editor-insert';
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
 * persisted rows on the bio-generation status query. Rendered directly above
 * the bio editors so tiles drag straight in; the Plus button on each tile
 * inserts at the focused editor's cursor (touch/keyboard path). While any
 * mutation is pending every control is disabled.
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

  const isMutating = [
    isDeletingBioLink,
    isDeletingBioImage,
    isUpdatingBioImageAttribution,
    isUpdatingBioImageAlt,
    isSettingDisplayImages,
  ].some(Boolean);

  const insertLink = (link: BioStatusLink): void => {
    const target = registry.getTarget();
    if (!target) return;
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
    if (!target) return;
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
