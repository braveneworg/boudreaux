/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import { buildBioFigureContent, buildBioLinkContent } from '@/app/components/ui/bio-editor-insert';
import {
  useDeleteBioImageMutation,
  useDeleteBioLinkMutation,
  useUpdateBioImageAttributionMutation,
} from '@/app/hooks/mutations/use-bio-media-mutations';
import { useArtistBioGenerationStatusQuery } from '@/app/hooks/use-artist-bio-generation-status-query';
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';
import type { BioStatusImage, BioStatusLink } from '@/lib/validation/bio-generation-schema';

import { useBioEditorRegistry } from './bio-editor-registry';
import { BioImagePalette } from './bio-image-palette';
import { BioLinkPalette } from './bio-link-palette';

interface BioMediaPalettesProps {
  artistId: string;
}

/**
 * Side-by-side curated palettes of the artist's discovered bio links and
 * images, fed by the persisted rows (bio-generation status query). Rendered
 * directly above the bio editors so tiles drag straight in. The Plus button
 * on each tile inserts at the focused editor's cursor (touch/keyboard path).
 * Renders nothing until the artist has at least one persisted bio image or
 * link; while any mutation (delete or attribution update) is pending both
 * palettes' controls are disabled.
 *
 * @param artistId - The artist whose discovered media to show (edit mode only).
 */
export const BioMediaPalettes = ({ artistId }: BioMediaPalettesProps): JSX.Element | null => {
  const status = useArtistBioGenerationStatusQuery(artistId);
  const { deleteBioLink, isDeletingBioLink } = useDeleteBioLinkMutation(artistId);
  const { deleteBioImage, isDeletingBioImage } = useDeleteBioImageMutation(artistId);
  const { updateBioImageAttribution, isUpdatingBioImageAttribution } =
    useUpdateBioImageAttributionMutation(artistId);
  const registry = useBioEditorRegistry();

  const content = status.data?.content ?? null;
  if (!content || (content.links.length === 0 && content.images.length === 0)) {
    return null;
  }

  const isMutating = isDeletingBioLink || isDeletingBioImage || isUpdatingBioImageAttribution;

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
      {content.links.length > 0 && (
        <BioLinkPalette
          artistId={artistId}
          links={content.links}
          onDelete={deleteBioLink}
          onInsert={insertLink}
          disabled={isMutating}
        />
      )}
      {content.images.length > 0 && (
        <BioImagePalette
          images={content.images}
          onDelete={deleteBioImage}
          onInsert={insertImage}
          onEditAttribution={(id, value) =>
            updateBioImageAttribution({ imageId: id, attribution: value })
          }
          disabled={isMutating}
        />
      )}
    </div>
  );
};
