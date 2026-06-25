/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Image from 'next/image';

import { ImagePlus, Loader2, X } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { cn } from '@/lib/utils';

import { CoverArtImageCombobox } from './cover-art-image-combobox';
import { VALID_IMAGE_TYPES, useCoverArtUpload } from './use-cover-art-upload';

import type { Control, FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form';

interface CoverArtFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  setValue: UseFormSetValue<TFieldValues>;
  artistIds: string[];
  disabled?: boolean;
  entityType?: 'artists' | 'releases' | 'tracks' | 'notifications' | 'featured-artists';
  /**
   * Stable entity ID used to scope cover-art uploads to one canonical S3 key.
   * When provided, uploads land at `media/{entityType}/{entityId}/cover.{ext}`
   * and re-uploads OVERWRITE the existing object (S3 PUT semantics) instead
   * of creating a new timestamped file each time. When omitted, falls back
   * to the legacy timestamp-suffixed key generation so callers without a
   * stable ID still work.
   */
  entityId?: string;
  /**
   * Optional callback fired after a successful upload AND variant generation.
   * When provided, the field also waits for variant generation (instead of
   * fire-and-forget) so the parent can persist the URL to the DB knowing the
   * srcset variants exist on S3. The "Uploading..." spinner stays visible
   * across the entire sequence.
   */
  onUploadComplete?: (cdnUrl: string) => Promise<void>;
}

interface PreviewProps {
  src: string;
  isUploading: boolean;
  disabled: boolean;
  onRemove: () => void;
}

const CoverArtPreview = ({ src, isUploading, disabled, onRemove }: PreviewProps) => (
  <div className="group relative h-40 w-40 overflow-hidden rounded-lg border">
    {/* `unoptimized` bypasses the custom image loader, which would
        otherwise rewrite the src to `_w{width}.webp`. Width variants
        are generated asynchronously after upload (fire-and-forget),
        and small originals never produce `_w750`+ variants — both
        cause broken-image flashes in this admin preview. The 160×160
        slot doesn't need variant resolution anyway. */}
    <Image src={src} alt="Cover art" fill className="object-cover" sizes="160px" unoptimized />
    {isUploading && (
      <div className="bg-background/80 absolute inset-0 flex items-center justify-center backdrop-blur-sm">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-950" />
      </div>
    )}
    {!isUploading && !disabled && (
      <button
        type="button"
        onClick={onRemove}
        className="bg-destructive/90 hover:bg-destructive absolute top-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="Remove cover art"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
);

interface DropZoneProps {
  isUploading: boolean;
  isDragOver: boolean;
  disabled: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const CoverArtDropZone = ({
  isUploading,
  isDragOver,
  disabled,
  fileInputRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileChange,
}: DropZoneProps) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => fileInputRef.current?.click()}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors',
        isDragOver && 'border-primary bg-primary/5',
        !isDragOver && 'border-muted-foreground/25 hover:border-muted-foreground/50',
        (disabled || isUploading) && 'cursor-not-allowed opacity-50'
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={VALID_IMAGE_TYPES.join(',')}
        onChange={onFileChange}
        disabled={disabled || isUploading}
        className="hidden"
        aria-label="Upload cover art"
      />
      {isUploading ? (
        <>
          <Loader2 className="mb-2 h-8 w-8 animate-spin text-zinc-950" />
          <p className="text-sm text-zinc-950">Uploading...</p>
        </>
      ) : (
        <>
          <ImagePlus className="mb-2 h-8 w-8 text-zinc-950" />
          <p className="text-center text-sm">
            <span className="text-foreground font-medium">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-zinc-950">JPEG, PNG, WebP, GIF up to 50MB</p>
        </>
      )}
    </div>
  );
};

export const CoverArtField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  setValue,
  artistIds,
  disabled = false,
  entityType = 'releases',
  entityId,
  onUploadComplete,
}: CoverArtFieldProps<TFieldValues, TName>) => {
  const {
    isUploading,
    localPreviewUrl,
    isDragOver,
    fileInputRef,
    handleFileSelect,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    clearPreview,
  } = useCoverArtUpload({ name, setValue, entityType, entityId, onUploadComplete });

  const handleSelectArtistImage = (src: string): void => {
    setValue(name, src as TFieldValues[TName], { shouldDirty: true, shouldValidate: true });
    clearPreview();
  };

  const handleRemove = (): void => {
    setValue(name, '' as TFieldValues[TName], { shouldDirty: true, shouldValidate: true });
    clearPreview();
  };

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Cover Art *</FormLabel>

          {(field.value || localPreviewUrl) && (
            <CoverArtPreview
              src={localPreviewUrl || (field.value as string)}
              isUploading={isUploading}
              disabled={disabled}
              onRemove={handleRemove}
            />
          )}

          <FormControl>
            <CoverArtDropZone
              isUploading={isUploading}
              isDragOver={isDragOver}
              disabled={disabled}
              fileInputRef={fileInputRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onFileChange={handleFileSelect}
            />
          </FormControl>

          <CoverArtImageCombobox
            artistIds={artistIds}
            currentValue={field.value as string}
            disabled={disabled}
            isUploading={isUploading}
            onSelect={handleSelectArtistImage}
          />

          <FormMessage />
        </FormItem>
      )}
    />
  );
};
