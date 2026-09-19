/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { DragEvent, JSX, ReactNode } from 'react';

import Image from 'next/image';

import { Eye, Pencil, TextCursorInput, X } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { BIO_IMAGE_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

import { FaceBadge, LicenseBadge } from './bio-image-badges';
import { BioImageInlineTextEditor } from './bio-image-inline-text-editor';

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

export interface BioImageLabels {
  thumbSrc: string;
  title: string | null;
  deleteLabel: string;
  previewLabel: string;
  alt: string;
}

/** Derive stable display labels from a BioStatusImage row. */
export const resolveImageLabels = (image: BioStatusImage): BioImageLabels => ({
  thumbSrc: image.thumbnailUrl ?? image.url,
  title: image.title ?? null,
  deleteLabel: image.title ?? image.url,
  previewLabel: image.title ?? 'image',
  alt: image.alt ?? image.title ?? 'Artist photo',
});

export interface BioImageTileProps {
  image: BioStatusImage;
  onDelete: (id: string) => void;
  onInsert: (image: BioStatusImage) => void;
  onEditAttribution: (imageId: string, attribution: string) => void;
  /** When given, the tile shows the alt text with an inline editor (display images need alt). */
  onEditAlt?: (imageId: string, alt: string) => void;
  disabled: boolean;
  /** Extra controls rendered in the tile's action row, before the delete button. */
  actions?: ReactNode;
  /** Extra badges rendered beside the license and face badges. */
  badges?: ReactNode;
}

type EditingField = 'attribution' | 'alt' | null;

interface EditableTextRowProps {
  /** Accessible name of the editor input, e.g. "Attribution". */
  label: string;
  value: string | null | undefined;
  /** Shown when the row has no value yet, e.g. "Add attribution". */
  emptyLabel: string;
  /** Accessible name of the pencil button. */
  editLabel: string;
  /** Optional prefix rendered before the value, e.g. "Alt: ". */
  prefix?: string;
  editing: boolean;
  disabled: boolean;
  onEdit: () => void;
  onSave: (value: string) => void;
  onCancel: () => void;
}

/** One editable text line on a tile: the value (or an empty hint) with a pencil, or the inline editor. */
const EditableTextRow = ({
  label,
  value,
  emptyLabel,
  editLabel,
  prefix = '',
  editing,
  disabled,
  onEdit,
  onSave,
  onCancel,
}: EditableTextRowProps): JSX.Element =>
  editing ? (
    <BioImageInlineTextEditor
      label={label}
      initialValue={value ?? ''}
      onSave={onSave}
      onCancel={onCancel}
    />
  ) : (
    <div className="flex items-center gap-1">
      {value ? (
        <p className="text-muted-foreground line-clamp-2 flex-1 text-[11px]">
          {prefix}
          {value}
        </p>
      ) : (
        <span className="text-muted-foreground flex-1 text-[11px]">{emptyLabel}</span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onEdit}
        aria-label={editLabel}
        className="hover:text-primary shrink-0 p-0.5"
      >
        <Pencil className="size-3.5" aria-hidden />
      </button>
    </div>
  );

/**
 * Single draggable bio image tile with preview, insert, delete, and
 * attribution-edit controls. Drags into the bio editors as an
 * `application/x-bio-image` payload; the Plus button inserts at the focused
 * editor's cursor (touch/keyboard path). The thumbnail is `unoptimized`
 * because a fresh upload's srcset variants are generated asynchronously and a
 * missing variant 403s on the CDN.
 */
export const BioImageTile = ({
  image,
  onDelete,
  onInsert,
  onEditAttribution,
  onEditAlt,
  disabled,
  actions,
  badges,
}: BioImageTileProps): JSX.Element => {
  const { thumbSrc, title, deleteLabel, previewLabel, alt } = resolveImageLabels(image);
  const [editing, setEditing] = useState<EditingField>(null);

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

  const handleSaveAttribution = (attribution: string): void => {
    onEditAttribution(image.id, attribution);
    setEditing(null);
  };

  const handleSaveAlt = (value: string): void => {
    onEditAlt?.(image.id, value);
    setEditing(null);
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
      <EditableTextRow
        label="Attribution"
        value={image.attribution}
        emptyLabel="Add attribution"
        editLabel={`Edit attribution for ${previewLabel}`}
        editing={editing === 'attribution'}
        disabled={disabled}
        onEdit={() => setEditing('attribution')}
        onSave={handleSaveAttribution}
        onCancel={() => setEditing(null)}
      />
      {onEditAlt && (
        <EditableTextRow
          label="Alt text"
          value={image.alt}
          emptyLabel="Add alt text"
          editLabel={`Edit alt text for ${previewLabel}`}
          prefix="Alt: "
          editing={editing === 'alt'}
          disabled={disabled}
          onEdit={() => setEditing('alt')}
          onSave={handleSaveAlt}
          onCancel={() => setEditing(null)}
        />
      )}
      <div className="flex flex-wrap items-center gap-1">
        <LicenseBadge license={image.license} licenseUrl={image.licenseUrl} />
        <FaceBadge hasFace={image.hasFace} faceScore={image.faceScore} />
        {badges}
      </div>
      <div className="flex gap-1">
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={`Preview ${previewLabel}`}
              title="Preview"
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
          title="Insert into the bio at the cursor"
          className="hover:text-primary p-0.5"
        >
          <TextCursorInput className="size-3.5" aria-hidden />
        </button>
        {actions}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDelete(image.id)}
          aria-label={`Delete image ${deleteLabel}`}
          title="Delete from the pool"
          className="hover:text-destructive ml-auto p-0.5"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  );
};
