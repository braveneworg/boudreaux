/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Image from 'next/image';

import { X } from 'lucide-react';

import { Button } from './button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from './dialog';
import { cleanImageUrl } from './image-uploader-utils';

import type { ImageItem } from './image-uploader-types';

interface ImagePreviewDialogProps {
  previewImage: ImageItem | null;
  onClose: () => void;
}

/**
 * Full-size preview dialog for a selected image.
 */
export const ImagePreviewDialog = ({
  previewImage,
  onClose,
}: ImagePreviewDialogProps): React.JSX.Element => (
  <Dialog open={!!previewImage} onOpenChange={onClose}>
    <DialogContent className="max-h-[90vh] max-w-[90vw] overflow-hidden p-0 sm:max-w-3xl">
      <DialogTitle className="sr-only">{previewImage?.altText || 'Image preview'}</DialogTitle>
      {previewImage && (
        <div className="relative aspect-auto max-h-[85vh] w-full">
          <Image
            src={cleanImageUrl(previewImage.preview)}
            alt={previewImage.altText || 'Image preview'}
            width={1200}
            height={800}
            className="h-auto max-h-[85vh] w-full object-contain"
            unoptimized={previewImage.preview.startsWith('blob:')}
          />
        </div>
      )}
      <DialogClose className="bg-background/90 text-foreground hover:bg-background absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center shadow-sm">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </Dialog>
);

interface ImageDeleteDialogProps {
  imageToDelete: ImageItem | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation dialog shown before removing an image.
 */
export const ImageDeleteDialog = ({
  imageToDelete,
  onCancel,
  onConfirm,
}: ImageDeleteDialogProps): React.JSX.Element => (
  <Dialog open={!!imageToDelete} onOpenChange={onCancel}>
    <DialogContent className="sm:max-w-md">
      <DialogTitle>Delete Image</DialogTitle>
      <p className="text-sm text-zinc-950">
        Are you sure you want to delete this image? This action cannot be undone.
      </p>
      {imageToDelete && (
        <div className="my-4 flex justify-center">
          <div className="relative h-32 w-32 overflow-hidden border">
            <Image
              src={cleanImageUrl(imageToDelete.preview)}
              alt={imageToDelete.altText || 'Image to delete'}
              fill
              className="object-cover"
              unoptimized={imageToDelete.preview.startsWith('blob:')}
            />
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" onClick={onConfirm}>
          Delete
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);
