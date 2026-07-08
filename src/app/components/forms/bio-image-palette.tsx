/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { DragEvent, JSX, KeyboardEvent } from 'react';

import Image from 'next/image';

import { Check, Eye, Pencil, Plus, X } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { BIO_IMAGE_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

// Preview-dialog intrinsics when the scrape didn't capture real dimensions —
// next/image only uses them for the initial aspect-ratio reservation, the
// `h-auto w-full` styling lets the loaded image keep its natural ratio.
const PREVIEW_FALLBACK_WIDTH = 800;
const PREVIEW_FALLBACK_HEIGHT = 600;

/** Real intrinsics from the scrape when present, fallbacks otherwise. */
const previewDimensions = (image: BioStatusImage): { width: number; height: number } => ({
  width: image.width ?? PREVIEW_FALLBACK_WIDTH,
  height: image.height ?? PREVIEW_FALLBACK_HEIGHT,
});

interface ImageLabels {
  thumbSrc: string;
  title: string | null;
  deleteLabel: string;
  previewLabel: string;
  alt: string;
}

/** Derive stable display labels from a BioStatusImage row. */
const resolveImageLabels = (image: BioStatusImage): ImageLabels => ({
  thumbSrc: image.thumbnailUrl ?? image.url,
  title: image.title ?? null,
  deleteLabel: image.title ?? image.url,
  previewLabel: image.title ?? 'image',
  alt: image.alt ?? image.title ?? 'Artist photo',
});

interface AttributionEditorProps {
  imageId: string;
  currentAttribution: string;
  onSave: (imageId: string, attribution: string) => void;
  onCancel: () => void;
}

/** Inline input for editing or adding a bio image attribution. */
const AttributionEditor = ({
  imageId,
  currentAttribution,
  onSave,
  onCancel,
}: AttributionEditorProps): JSX.Element => {
  const [draft, setDraft] = useState(currentAttribution);

  const save = (): void => {
    onSave(imageId, draft.trim());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') save();
    if (event.key === 'Escape') onCancel();
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        aria-label="Attribution"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={500}
        className="h-6 text-[11px]"
      />
      <div className="flex gap-1">
        <Button type="button" size="sm" onClick={save} className="h-5 px-2 text-[11px]">
          <Check className="size-3" aria-hidden />
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="h-5 px-2 text-[11px]"
        >
          <X className="size-3" aria-hidden />
          Cancel
        </Button>
      </div>
    </div>
  );
};

interface BioImageTileProps {
  image: BioStatusImage;
  onDelete: (id: string) => void;
  onInsert: (image: BioStatusImage) => void;
  onEditAttribution: (imageId: string, attribution: string) => void;
  disabled: boolean;
}

/** Single draggable image tile with preview, insert, delete, and attribution-edit controls. */
const BioImageTile = ({
  image,
  onDelete,
  onInsert,
  onEditAttribution,
  disabled,
}: BioImageTileProps): JSX.Element => {
  const { thumbSrc, title, deleteLabel, previewLabel, alt } = resolveImageLabels(image);
  const [editing, setEditing] = useState(false);

  const onDragStart = (event: DragEvent<HTMLLIElement>): void => {
    event.dataTransfer.setData(
      BIO_IMAGE_DRAG_MIME,
      JSON.stringify({
        url: image.url,
        thumbnailUrl: image.thumbnailUrl ?? null,
        title,
        attribution: image.attribution ?? null,
        alt,
        width: image.width ?? null,
        height: image.height ?? null,
      })
    );
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleSave = (imageId: string, attribution: string): void => {
    onEditAttribution(imageId, attribution);
    setEditing(false);
  };

  return (
    <li
      draggable
      onDragStart={onDragStart}
      className="border-border bg-background relative flex cursor-grab flex-col gap-1 border p-1 active:cursor-grabbing"
    >
      {image.kind && (
        <Badge variant="outline" className="bg-background/80 absolute top-1 left-1 text-[10px]">
          {image.kind}
        </Badge>
      )}
      {image.origin === 'custom' && (
        <Badge variant="outline" className="bg-background/80 absolute top-1 right-1 text-[10px]">
          Custom
        </Badge>
      )}
      <Image
        src={thumbSrc}
        alt={alt}
        width={96}
        height={96}
        unoptimized
        className="h-24 w-full object-cover"
      />
      {editing ? (
        <AttributionEditor
          imageId={image.id}
          currentAttribution={image.attribution ?? ''}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex items-center gap-1">
          {image.attribution ? (
            <p className="text-muted-foreground line-clamp-2 flex-1 text-[11px]">
              {image.attribution}
            </p>
          ) : (
            <span className="text-muted-foreground flex-1 text-[11px]">Add attribution</span>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(true)}
            aria-label={`Edit attribution for ${previewLabel}`}
            className="hover:text-primary shrink-0 p-0.5"
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
      <div className="flex gap-1">
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={`Preview ${previewLabel}`}
              className="hover:text-primary p-0.5"
            >
              <Eye className="size-3.5" aria-hidden />
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{title ?? 'Image preview'}</DialogTitle>
            </DialogHeader>
            <Image
              src={image.url}
              alt={alt}
              {...previewDimensions(image)}
              unoptimized
              className="h-auto w-full"
            />
            {image.attribution && (
              <p className="text-muted-foreground text-xs">{image.attribution}</p>
            )}
          </DialogContent>
        </Dialog>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onInsert(image)}
          aria-label={`Insert image ${previewLabel}`}
          className="hover:text-primary p-0.5"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDelete(image.id)}
          aria-label={`Delete image ${deleteLabel}`}
          className="hover:text-destructive ml-auto p-0.5"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  );
};

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
