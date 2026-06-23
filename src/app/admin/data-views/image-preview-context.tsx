/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { ImagePreviewDialog } from './components/image-preview-dialog';

import type { PreviewImage } from './data-view-types';

interface ImagePreviewContextValue {
  /** Opens the shared preview dialog for the given image. */
  openPreview: (image: PreviewImage) => void;
}

const ImagePreviewContext = createContext<ImagePreviewContextValue | null>(null);

/**
 * Owns the single preview-dialog state shared across a DataView. Thumbnails deep in
 * the card tree call {@link useImagePreview} to open the dialog without threading a
 * setter through every intermediate component.
 */
export const ImagePreviewProvider = ({ children }: { children: ReactNode }): ReactElement => {
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);

  const openPreview = useCallback((image: PreviewImage) => setPreviewImage(image), []);
  const value = useMemo<ImagePreviewContextValue>(() => ({ openPreview }), [openPreview]);

  return (
    <ImagePreviewContext.Provider value={value}>
      {children}
      <ImagePreviewDialog previewImage={previewImage} onClose={() => setPreviewImage(null)} />
    </ImagePreviewContext.Provider>
  );
};

/**
 * Returns the action to open the shared image-preview dialog. Must be used within an
 * {@link ImagePreviewProvider}.
 */
export const useImagePreview = (): ImagePreviewContextValue => {
  const context = useContext(ImagePreviewContext);
  if (!context) {
    throw new Error('useImagePreview must be used within an ImagePreviewProvider');
  }
  return context;
};
