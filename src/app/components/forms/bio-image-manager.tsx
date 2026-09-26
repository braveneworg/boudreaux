/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId, useState } from 'react';
import type { JSX } from 'react';

import { Plus } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';
import {
  chosenDisplayImageIds,
  DISPLAY_IMAGE_CAP,
  orderBioImagesForPicker,
} from '@/lib/utils/display-images';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

import { BioImageTile, resolveImageLabels } from './bio-image-tile';
import { BioImageUploadZone } from './bio-image-upload-zone';
import { DisplayImageStrip } from './display-image-strip';
import { ImageSourceLinksSection } from './image-source-links-section';
import { useBioImageUpload } from './use-bio-image-upload';

export interface BioImageManagerProps {
  artistId: string;
  /** The artist's whole bio image pool (may be empty). */
  images: BioStatusImage[];
  /** True while the pool is still loading; renders a placeholder instead of an empty pool. */
  isLoading?: boolean;
  /**
   * Why the pool could not be loaded, already phrased for the admin, or
   * `null`/absent when it loaded. Shown (with Retry) instead of the empty
   * state so a failed read never passes for an artist with no images.
   */
  loadError?: string | null;
  /** Re-requests the pool after a load failure. */
  onRetry?: () => void;
  onDelete: (imageId: string) => void;
  onInsert: (image: BioStatusImage) => void;
  onEditAttribution: (imageId: string, attribution: string) => void;
  onEditAlt: (imageId: string, alt: string) => void;
  /** Replaces the artist's display images with the given ordered ids. */
  onSetDisplayImages: (imageIds: string[]) => void;
  /** Called after an upload lands in the pool (before any auto-selection). */
  onUploaded: (image: ArtistBioImageRecord) => void;
  disabled?: boolean;
}

/**
 * Why a tile's "use" affordance is disabled, or `null` when it is usable. A
 * missing alt is not a reason: the set action backfills it with the artist's
 * name, the same default an upload gets.
 */
const disabledReasonFor = (image: BioStatusImage, chosenIds: string[]): 'chosen' | 'cap' | null => {
  if (chosenIds.includes(image.id)) return 'chosen';
  if (chosenIds.length >= DISPLAY_IMAGE_CAP) return 'cap';
  return null;
};

const REASON_COPY = new Map<'chosen' | 'cap', string>([
  ['chosen', 'Already a display image'],
  ['cap', `Remove a display image first (limit ${DISPLAY_IMAGE_CAP})`],
]);

const matchesFilter = (image: BioStatusImage, lower: string): boolean =>
  (image.title ?? '').toLowerCase().includes(lower) ||
  (image.attribution ?? '').toLowerCase().includes(lower) ||
  (image.alt ?? '').toLowerCase().includes(lower) ||
  (image.kind ?? '').toLowerCase().includes(lower);

/**
 * The one place an admin manages an artist's bio images: an upload zone into
 * the pool, the chosen display images (ordered strip with a drop target that
 * takes a pool tile or a desktop file), and the pool itself as a filterable
 * grid of tiles that still drag into the bio editors, insert at the cursor,
 * preview, delete, and edit attribution — plus alt editing and a "use as
 * display image" affordance whose disabled reason is spelled out.
 *
 * Mounts even with an empty pool, because uploading is its job too. Chosen
 * rows and the picker order are derived from the pool through the shared
 * display-image rules so this view never disagrees with the public page.
 */
export const BioImageManager = ({
  artistId,
  images,
  isLoading = false,
  loadError = null,
  onRetry,
  onDelete,
  onInsert,
  onEditAttribution,
  onEditAlt,
  onSetDisplayImages,
  onUploaded,
  disabled = false,
}: BioImageManagerProps): JSX.Element => {
  const hintIdBase = useId();
  const [filter, setFilter] = useState('');

  const chosenIds = chosenDisplayImageIds(images);
  const chosen = chosenIds.flatMap((id) => images.filter((image) => image.id === id));
  const lower = filter.trim().toLowerCase();
  const pool = orderBioImagesForPicker(images).filter(
    (image) => !lower || matchesFilter(image, lower)
  );

  const chooseImage = (image: BioStatusImage): void => {
    onSetDisplayImages([...chosenIds, image.id]);
  };

  // A fresh upload joins the set while there is room; a blank alt is
  // backfilled with the artist's name by the set action.
  const handleUploaded = (record: ArtistBioImageRecord): void => {
    onUploaded(record);
    if (chosenIds.length < DISPLAY_IMAGE_CAP) {
      onSetDisplayImages([...chosenIds, record.id]);
    }
  };

  const dropUpload = useBioImageUpload({ artistId, onUploaded: handleUploaded });

  const handleDropPoolImage = (imageId: string): void => {
    if (chosenIds.includes(imageId) || chosenIds.length >= DISPLAY_IMAGE_CAP) return;
    const image = images.find((candidate) => candidate.id === imageId);
    if (image) chooseImage(image);
  };

  const handleDropFile = (file: File): void => {
    void dropUpload.upload(file, { alt: null, attribution: '' });
  };

  return (
    <section aria-label="Bio images" className="space-y-4">
      <BioImageUploadZone artistId={artistId} onUploaded={handleUploaded} disabled={disabled} />

      <DisplayImageStrip
        images={chosen}
        onReorder={onSetDisplayImages}
        onRemove={(id) => onSetDisplayImages(chosenIds.filter((chosenId) => chosenId !== id))}
        onDropPoolImage={handleDropPoolImage}
        onDropFile={handleDropFile}
        isUploading={dropUpload.isUploading}
        uploadError={dropUpload.errorMessage}
        disabled={disabled}
      />

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Image pool ({images.length})</h3>
        {isLoading ? (
          <p role="status" className="text-muted-foreground text-xs">
            Loading images…
          </p>
        ) : images.length === 0 && loadError ? (
          <div role="alert" className="space-y-2 text-xs">
            <p className="text-destructive">Couldn&apos;t load the image pool — {loadError}.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => onRetry?.()}>
              Retry
            </Button>
          </div>
        ) : images.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No images yet — upload one above, drop one on the display images, or generate the bio to
            discover some.
          </p>
        ) : (
          <>
            <Input
              aria-label="Filter images"
              placeholder="Filter…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-7 text-xs"
            />
            <ul
              role="group"
              aria-label="Image pool"
              className="grid max-h-96 grid-cols-3 gap-2 overflow-y-auto pr-1"
            >
              {pool.map((image) => {
                const reason = disabledReasonFor(image, chosenIds);
                const hintId = `${hintIdBase}-${image.id}`;
                const { previewLabel } = resolveImageLabels(image);
                const position = chosenIds.indexOf(image.id);
                return (
                  <BioImageTile
                    key={image.id}
                    image={image}
                    onDelete={onDelete}
                    onInsert={onInsert}
                    onEditAttribution={onEditAttribution}
                    onEditAlt={onEditAlt}
                    disabled={disabled}
                    badges={
                      <>
                        {position !== -1 && (
                          <Badge variant="outline" className="bg-background/80 text-[10px]">
                            Display {position + 1}
                          </Badge>
                        )}
                        {position === -1 && image.isPrimary && (
                          <Badge variant="outline" className="bg-background/80 text-[10px]">
                            Suggested
                          </Badge>
                        )}
                      </>
                    }
                    actions={
                      <>
                        <button
                          type="button"
                          disabled={disabled || reason !== null}
                          onClick={() => chooseImage(image)}
                          aria-label={`Use ${previewLabel} as display image`}
                          aria-describedby={reason ? hintId : undefined}
                          title={reason ? REASON_COPY.get(reason) : 'Add to display images'}
                          className="hover:text-primary p-0.5 disabled:opacity-40"
                        >
                          <Plus className="size-3.5" aria-hidden />
                        </button>
                        {reason && (
                          <span id={hintId} className="sr-only">
                            {REASON_COPY.get(reason)}
                          </span>
                        )}
                      </>
                    }
                  />
                );
              })}
            </ul>
          </>
        )}
      </div>

      <ImageSourceLinksSection artistId={artistId} disabled={disabled} />
    </section>
  );
};
