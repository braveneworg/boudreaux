/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactElement } from 'react';

import Image from 'next/image';

import { Music } from 'lucide-react';

import { cn } from '@/lib/utils';

interface PlaylistCoverTilesProps {
  /** Cover image URLs; only the first four render as tiles */
  images: string[];
  /** Accessible label carried by the first tile's image */
  alt: string;
  /** `sm` = 56px row thumb (default); `lg` fills the parent width */
  size?: 'sm' | 'lg';
  /** Extra classes composed onto the frame (e.g. margins from the parent) */
  className?: string;
}

/** Responsive `sizes` hint per frame variant. */
const TILE_SIZES: Record<'sm' | 'lg', string> = {
  sm: '56px',
  lg: '(max-width: 640px) 100vw, 512px',
};

/** Grid split per rendered tile count: 2 → columns, 3+ → 2×2 mosaic. */
const gridLayoutClass = (count: number): string => {
  if (count >= 3) return 'grid-cols-2 grid-rows-2';
  return count === 2 ? 'grid-cols-2' : '';
};

/**
 * Zine-framed cover mosaic for a playlist — up to four covers tiled inside a
 * hard black square. Pure presentational; reused at row-thumb (`sm`) and
 * full-width (`lg`) sizes. Empty playlists show a neutral placeholder.
 */
export const PlaylistCoverTiles = ({
  images,
  alt,
  size = 'sm',
  className,
}: PlaylistCoverTilesProps): ReactElement => {
  const tiles = images
    .slice(0, 4)
    .map((src, index) => ({ id: `cover-${index}`, isFirst: index === 0, src }));

  return (
    <div
      className={cn(
        'grid aspect-square auto-rows-fr overflow-hidden border-2 border-black',
        size === 'sm' ? 'size-14' : 'w-full',
        gridLayoutClass(tiles.length),
        className
      )}
    >
      {tiles.length === 0 ? (
        <div
          data-testid="playlist-cover-placeholder"
          className="flex items-center justify-center bg-zinc-200"
        >
          <Music
            aria-hidden="true"
            className={cn('text-zinc-500', size === 'sm' ? 'size-6' : 'size-10')}
          />
        </div>
      ) : (
        tiles.map(({ id, isFirst, src }) => (
          <div key={id} className={cn('relative', tiles.length === 3 && isFirst && 'row-span-2')}>
            <Image
              src={src}
              alt={isFirst ? alt : ''}
              aria-hidden={isFirst ? undefined : true}
              fill
              sizes={size === 'sm' ? TILE_SIZES.sm : TILE_SIZES.lg}
              className="object-cover"
            />
          </div>
        ))
      )}
    </div>
  );
};
