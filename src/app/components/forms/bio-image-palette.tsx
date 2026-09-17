/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { JSX } from 'react';

import { Input } from '@/app/components/ui/input';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

import { BioImageTile } from './bio-image-tile';

interface BioImagePaletteProps {
  images: BioStatusImage[];
  onDelete: (imageId: string) => void;
  onInsert: (image: BioStatusImage) => void;
  onEditAttribution: (imageId: string, attribution: string) => void;
  disabled?: boolean;
}

/** Curated, draggable grid of discovered images. Tiles drag into the bio
 *  editors as `application/x-bio-image` payloads; the Plus button inserts
 *  at the focused editor's cursor (touch/keyboard path); eye opens a full
 *  preview; X deletes the row; pencil edits the attribution inline. */
export const BioImagePalette = ({
  images,
  onDelete,
  onInsert,
  onEditAttribution,
  disabled = false,
}: BioImagePaletteProps): JSX.Element => {
  const [filter, setFilter] = useState('');

  const lower = filter.toLowerCase();
  const filtered = lower
    ? images.filter(
        (image) =>
          (image.title ?? '').toLowerCase().includes(lower) ||
          (image.attribution ?? '').toLowerCase().includes(lower) ||
          (image.kind ?? '').toLowerCase().includes(lower)
      )
    : images;
  const visible = [...filtered].sort(
    (a, b) => Number(b.origin === 'custom') - Number(a.origin === 'custom')
  );

  return (
    <div role="group" aria-label="Discovered images" className="space-y-2">
      <h3 className="text-sm font-semibold">Discovered images ({images.length})</h3>
      <Input
        aria-label="Filter images"
        placeholder="Filter…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        className="h-7 text-xs"
      />
      <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto pr-1">
        {visible.map((image) => (
          <BioImageTile
            key={image.id}
            image={image}
            onDelete={onDelete}
            onInsert={onInsert}
            onEditAttribution={onEditAttribution}
            disabled={disabled}
          />
        ))}
      </ul>
    </div>
  );
};
