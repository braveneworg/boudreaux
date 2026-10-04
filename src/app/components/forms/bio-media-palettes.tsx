/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import { toast } from 'sonner';

import { buildBioFigureContent, buildBioLinkContent } from '@/app/components/ui/bio-editor-insert';
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';
import type { BioStatusImage, BioStatusLink } from '@/lib/validation/bio-generation-schema';

import { useArtistPool } from './_hooks/use-artist-pool';
import { useBioEditorRegistry } from './bio-editor-registry';
import { BioImageManager } from './bio-image-manager';
import { BioLinkPalette } from './bio-link-palette';

interface BioMediaPalettesProps {
  artistId: string;
}

/** Shown when an insert button is pressed while no bio editor holds the cursor. */
const NO_EDITOR_TARGET_COPY = 'Click into a bio editor first, then insert.';

/**
 * The artist form's media rail: the links palette (its custom-link editor
 * mounts even with no links, as the image manager does with an empty pool)
 * beside the bio image manager. Both render the artist pool module, which
 * owns the read, every write and the cache policy — when the read fails
 * outright the manager shows the failure with a Retry, never an empty pool.
 * Rendered directly above the bio editors so tiles drag straight in; the
 * Plus button on each tile inserts at the focused editor's cursor
 * (touch/keyboard path). While any pool write is in flight — an upload
 * included — every control is disabled.
 *
 * @param artistId - The artist whose media to manage (edit mode only).
 */
export const BioMediaPalettes = ({ artistId }: BioMediaPalettesProps): JSX.Element => {
  const pool = useArtistPool(artistId);
  const registry = useBioEditorRegistry();

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
      <BioLinkPalette
        artistId={artistId}
        links={pool.links}
        onDelete={pool.removeLink}
        onInsert={insertLink}
        disabled={pool.isMutating}
      />
      <BioImageManager
        artistId={artistId}
        images={pool.images}
        isLoading={pool.isPending}
        loadError={pool.loadError}
        onRetry={pool.retry}
        onDelete={pool.remove}
        onInsert={insertImage}
        onEditAttribution={pool.setAttribution}
        onEditAlt={pool.setAlt}
        onSetDisplayImages={pool.setDisplayImages}
        onUpload={pool.add}
        isUploading={pool.isAdding}
        uploadError={pool.addError}
        disabled={pool.isMutating}
      />
    </div>
  );
};
