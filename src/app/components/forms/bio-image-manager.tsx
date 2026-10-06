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
import {
  chosenDisplayImageIds,
  type DisplayImageTier,
  orderBioImagesForPicker,
  resolveDisplayImageSet,
} from '@/lib/utils/display-images';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

import { BioImageTile, resolveImageLabels } from './bio-image-tile';
import { BioImageUploadZone } from './bio-image-upload-zone';
import { DisplayImageStrip } from './display-image-strip';
import { ImageSourceLinksSection } from './image-source-links-section';

import type { ArtistPool } from './_hooks/use-artist-pool';

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
  /** Uploads one file into the pool; the pool decides whether it joins the display images. */
  onUpload: ArtistPool['add'];
  /** True while any upload is in flight (zone or strip drop). */
  isUploading?: boolean;
  /** Why the last upload failed, phrased for the admin, or null. */
  uploadError?: string | null;
  disabled?: boolean;
}

/**
 * Why a tile's "use" affordance is disabled, or `null` when it is usable. A
 * missing alt is not a reason: the set action backfills it with the artist's
 * name, the same default an upload gets.
 */
const disabledReasonFor = (image: BioStatusImage, chosenIds: string[]): 'chosen' | null =>
  chosenIds.includes(image.id) ? 'chosen' : null;

const REASON_COPY = new Map<'chosen', string>([['chosen', 'Already a display image']]);

/**
 * Badge copy for a tile the public page shows from a fallback tier — only
 * while nothing is chosen, so the chosen tier has none (its tiles carry
 * "Display n").
 */
const SHOWN_COPY = new Map<Exclude<DisplayImageTier, 'chosen'>, string>([
  ['suggested', 'Shown (suggested)'],
  ['pool', 'Shown (first in pool)'],
]);

interface PoolTileBadgeProps {
  /** 0-based chosen position, or -1 when the tile is not chosen. */
  position: number;
  /** The "Shown …" copy when the page shows this tile from a fallback tier. */
  shownLabel?: string;
  /** The job suggested this image (`isPrimary`). */
  isSuggested: boolean;
}

/**
 * A pool tile's display-state badge, by precedence: its chosen position, else
 * that the page shows it from a fallback tier, else that the job suggested it.
 */
const PoolTileBadge = ({
  position,
  shownLabel,
  isSuggested,
}: PoolTileBadgeProps): JSX.Element | null => {
  let label: string | null = null;
  if (position !== -1) label = `Display ${position + 1}`;
  else if (shownLabel) label = shownLabel;
  else if (isSuggested) label = 'Suggested';
  if (!label) return null;
  return (
    <Badge variant="outline" className="bg-background/80 text-[10px]">
      {label}
    </Badge>
  );
};

/** Everything the manager derives from the pool through the shared display-image rules. */
const derivePoolView = (
  images: BioStatusImage[],
  filter: string
): {
  chosenIds: string[];
  chosen: BioStatusImage[];
  shownIds: Set<string>;
  shownCopy: string | undefined;
  pool: BioStatusImage[];
} => {
  const chosenIds = chosenDisplayImageIds(images);
  // What the public page shows right now; the fallback tiers are marked on the
  // tiles so the admin sees the same images the public does.
  const { tier, images: shownImages } = resolveDisplayImageSet(images);
  const lower = filter.trim().toLowerCase();
  return {
    chosenIds,
    chosen: chosenIds.flatMap((id) => images.filter((image) => image.id === id)),
    shownIds: new Set(shownImages.map(({ id }) => id)),
    shownCopy: tier === 'chosen' ? undefined : SHOWN_COPY.get(tier),
    pool: orderBioImagesForPicker(images).filter((image) => !lower || matchesFilter(image, lower)),
  };
};

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
 * rows, the picker order, and the "Shown" badges on the images the page falls
 * back to while nothing is chosen are all derived from the pool through the
 * shared display-image rules, so this view never disagrees with the public
 * page. Every write — an upload included, and whether it joins the display
 * images — is the artist pool module's; this is a render of it.
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
  onUpload,
  isUploading = false,
  uploadError = null,
  disabled = false,
}: BioImageManagerProps): JSX.Element => {
  const hintIdBase = useId();
  const [filter, setFilter] = useState('');

  const { chosenIds, chosen, shownIds, shownCopy, pool } = derivePoolView(images, filter);

  const chooseImage = (image: BioStatusImage): void => {
    onSetDisplayImages([...chosenIds, image.id]);
  };

  const handleDropPoolImage = (imageId: string): void => {
    if (chosenIds.includes(imageId)) return;
    const image = images.find((candidate) => candidate.id === imageId);
    if (image) chooseImage(image);
  };

  const handleDropFile = (file: File): void => {
    void onUpload(file, { alt: null, attribution: '' });
  };

  return (
    <section aria-label="Bio images" className="space-y-4">
      <BioImageUploadZone
        onUpload={onUpload}
        isUploading={isUploading}
        errorMessage={uploadError}
        disabled={disabled}
      />

      <DisplayImageStrip
        images={chosen}
        onReorder={onSetDisplayImages}
        onRemove={(id) => onSetDisplayImages(chosenIds.filter((chosenId) => chosenId !== id))}
        onDropPoolImage={handleDropPoolImage}
        onDropFile={handleDropFile}
        isUploading={isUploading}
        uploadError={uploadError}
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
                      <PoolTileBadge
                        position={position}
                        shownLabel={shownIds.has(image.id) ? shownCopy : undefined}
                        isSuggested={image.isPrimary}
                      />
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
