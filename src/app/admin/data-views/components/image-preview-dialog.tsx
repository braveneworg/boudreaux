/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import Image from 'next/image';

import { X } from 'lucide-react';

import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/app/components/ui/dialog';

import { cleanImageUrl } from '../data-view-utils';

import type { PreviewImage } from '../data-view-types';

interface ImagePreviewDialogProps {
  /** The image to preview, or `null` when the dialog is closed. */
  previewImage: PreviewImage | null;
  /** Called when the dialog requests to close. */
  onClose: () => void;
}

/**
 * Full-screen preview of a single thumbnail. Base64 data URLs are passed through
 * `unoptimized`; remote URLs are cleaned of duplicate protocols first.
 */
export const ImagePreviewDialog = ({
  previewImage,
  onClose,
}: ImagePreviewDialogProps): ReactElement => (
  <Dialog open={!!previewImage} onOpenChange={onClose}>
    <DialogContent className="max-h-[90vh] max-w-[90vw] overflow-hidden p-0 sm:max-w-3xl">
      <DialogTitle className="sr-only">{previewImage?.altText || 'Image preview'}</DialogTitle>
      {previewImage && (
        <div className="relative aspect-auto max-h-[85vh] w-full">
          {previewImage.src.startsWith('data:') ? (
            // Base64 data URLs are passed through unoptimized
            <Image
              src={previewImage.src}
              alt={previewImage.altText || 'Image preview'}
              width={1200}
              height={800}
              unoptimized
              className="h-auto max-h-[85vh] w-full object-contain"
            />
          ) : (
            <Image
              src={cleanImageUrl(previewImage.src)}
              alt={previewImage.altText || 'Image preview'}
              width={1200}
              height={800}
              className="h-auto max-h-[85vh] w-full object-contain"
            />
          )}
        </div>
      )}
      <DialogClose className="bg-background/90 text-foreground hover:bg-background absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-sm">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </Dialog>
);
