/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import {
  useDeleteBioImageMutation,
  useDeleteBioLinkMutation,
} from '@/app/hooks/mutations/use-bio-media-mutations';
import { useArtistBioGenerationStatusQuery } from '@/app/hooks/use-artist-bio-generation-status-query';

import { BioImagePalette } from './bio-image-palette';
import { BioLinkPalette } from './bio-link-palette';

interface BioMediaPalettesProps {
  artistId: string;
}

/**
 * Side-by-side curated palettes of the artist's discovered bio links and
 * images, fed by the persisted rows (bio-generation status query). Rendered
 * directly above the bio editors so tiles drag straight in. Renders nothing
 * until a generation has succeeded and left at least one row; while either
 * delete mutation is pending both palettes' delete buttons are disabled.
 *
 * @param artistId - The artist whose discovered media to show (edit mode only).
 */
export const BioMediaPalettes = ({ artistId }: BioMediaPalettesProps): JSX.Element | null => {
  const status = useArtistBioGenerationStatusQuery(artistId);
  const { deleteBioLink, isDeletingBioLink } = useDeleteBioLinkMutation(artistId);
  const { deleteBioImage, isDeletingBioImage } = useDeleteBioImageMutation(artistId);

  const content = status.data?.status === 'succeeded' ? status.data.content : null;
  if (!content || (content.links.length === 0 && content.images.length === 0)) {
    return null;
  }

  const isDeleting = isDeletingBioLink || isDeletingBioImage;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {content.links.length > 0 && (
        <BioLinkPalette links={content.links} onDelete={deleteBioLink} disabled={isDeleting} />
      )}
      {content.images.length > 0 && (
        <BioImagePalette images={content.images} onDelete={deleteBioImage} disabled={isDeleting} />
      )}
    </div>
  );
};
