/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import NextImage from 'next/image';

import { ImagePlus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';

import type { RichTextEditorImage, RichTextEditorUploadHandler } from './rich-text-editor';

interface LabeledTextFieldProps {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  hint?: string;
}

/** Label + Input pair used by the link and image dialogs. */
export const LabeledTextField = ({
  id,
  label,
  value,
  onValueChange,
  placeholder,
  type = 'text',
  disabled = false,
  hint,
}: LabeledTextFieldProps): JSX.Element => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      disabled={disabled}
      aria-describedby={hint ? `${id}-hint` : undefined}
    />
    {hint ? (
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        {hint}
      </p>
    ) : null}
  </div>
);

interface ImageLibraryGridProps {
  images: RichTextEditorImage[];
  onInsertImage: (image: RichTextEditorImage) => void;
}

/** The existing pick-from-library grid of the artist's re-hosted bio images. */
const ImageLibraryGrid = ({ images, onInsertImage }: ImageLibraryGridProps): JSX.Element => (
  <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
    {images.map((image) => (
      <li key={image.url}>
        <button
          type="button"
          aria-label={`Insert ${image.alt ?? 'image'}`}
          className="ring-border focus-visible:ring-primary block overflow-hidden ring-1 focus-visible:ring-2 focus-visible:outline-none"
          onClick={() => onInsertImage(image)}
        >
          <NextImage
            src={image.url}
            alt={image.alt ?? ''}
            width={120}
            height={120}
            className="size-full object-cover"
          />
        </button>
      </li>
    ))}
  </ul>
);

interface ImageUploadPanelProps {
  onUploadImage: RichTextEditorUploadHandler;
  imageTitle: string;
  imageSubtitle: string;
  imageAttribution: string;
  onInsertImage: (image: RichTextEditorImage) => void;
}

/**
 * Upload panel: a drop zone with a tap-to-pick file input plus the shared
 * caption state, gated behind a chosen file and a non-empty attribution. On a
 * successful upload the resolved image is inserted; a failed upload surfaces a
 * toast and keeps the panel open for a retry.
 */
const ImageUploadPanel = ({
  onUploadImage,
  imageTitle,
  imageSubtitle,
  imageAttribution,
  onInsertImage,
}: ImageUploadPanelProps): JSX.Element => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const selectFile = (next: File): void => {
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.files?.[0];
    if (next) selectFile(next);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const next = event.dataTransfer.files?.[0];
    if (next) selectFile(next);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
  };

  const canSubmit = !!file && imageAttribution.trim().length > 0 && !uploading;

  const handleUpload = async (): Promise<void> => {
    if (!file) return;
    setUploading(true);
    try {
      const image = await onUploadImage(file, {
        attribution: imageAttribution,
        title: imageTitle.trim() || null,
        subtitle: imageSubtitle.trim() || null,
      });
      if (image) {
        onInsertImage(image);
      } else {
        toast.error('Upload failed. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-muted-foreground/25 hover:border-muted-foreground/50 relative flex min-h-40 flex-col items-center justify-center border-2 border-dashed p-4 text-center transition-colors"
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Upload image file"
        />
        {previewUrl ? (
          <NextImage
            src={previewUrl}
            alt=""
            width={320}
            height={160}
            unoptimized
            className="max-h-40 w-auto object-contain"
          />
        ) : (
          <>
            <ImagePlus className="text-muted-foreground mb-2 size-8" aria-hidden />
            <p className="text-sm">
              <span className="text-foreground font-medium">Click to upload</span> or drag and drop
            </p>
          </>
        )}
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={!canSubmit}
        onClick={() => void handleUpload()}
      >
        Upload &amp; insert
      </Button>
    </div>
  );
};

export interface ImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: RichTextEditorImage[];
  imageTitle: string;
  imageSubtitle: string;
  imageAttribution: string;
  onImageTitleChange: (v: string) => void;
  onImageSubtitleChange: (v: string) => void;
  onImageAttributionChange: (v: string) => void;
  onInsertImage: (image: RichTextEditorImage) => void;
  /** When provided, the dialog adds an Upload tab beside the Library grid. */
  onUploadImage?: RichTextEditorUploadHandler;
}

/**
 * Insert-image dialog for the RichTextEditor. Renders the shared caption fields
 * (title/subtitle/attribution) plus a picker. With no `onUploadImage` it is the
 * original pick-only library grid; when supplied it adds a shadcn `Tabs` with a
 * Library grid and an Upload panel (drag/tap-to-pick + required attribution).
 * The caption fields are controlled by the editor so both modes insert with the
 * same title/subtitle/attribution.
 */
export const ImageDialog = ({
  open,
  onOpenChange,
  images,
  imageTitle,
  imageSubtitle,
  imageAttribution,
  onImageTitleChange,
  onImageSubtitleChange,
  onImageAttributionChange,
  onInsertImage,
  onUploadImage,
}: ImageDialogProps): JSX.Element => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Insert image</DialogTitle>
        <DialogDescription>
          {onUploadImage
            ? "Choose one of this artist's images or upload a new one. Caption lines are optional for library images; uploads require an attribution."
            : "Choose one of this artist's images. Caption lines are optional."}
        </DialogDescription>
      </DialogHeader>
      <LabeledTextField
        id="rte-image-title"
        label="Title"
        value={imageTitle}
        onValueChange={onImageTitleChange}
      />
      <LabeledTextField
        id="rte-image-subtitle"
        label="Subtitle"
        value={imageSubtitle}
        onValueChange={onImageSubtitleChange}
      />
      <LabeledTextField
        id="rte-image-attribution"
        label="Attribution"
        value={imageAttribution}
        onValueChange={onImageAttributionChange}
      />
      {onUploadImage ? (
        <Tabs defaultValue="library">
          <TabsList className="w-full">
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
          </TabsList>
          <TabsContent value="library">
            <ImageLibraryGrid images={images} onInsertImage={onInsertImage} />
          </TabsContent>
          <TabsContent value="upload">
            <ImageUploadPanel
              onUploadImage={onUploadImage}
              imageTitle={imageTitle}
              imageSubtitle={imageSubtitle}
              imageAttribution={imageAttribution}
              onInsertImage={onInsertImage}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <ImageLibraryGrid images={images} onInsertImage={onInsertImage} />
      )}
    </DialogContent>
  </Dialog>
);
