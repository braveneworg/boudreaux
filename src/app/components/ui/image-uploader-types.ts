/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Represents an image item in the uploader
 */
export interface ImageItem {
  id: string;
  file?: File;
  preview: string;
  caption?: string;
  altText?: string;
  isUploading?: boolean;
  uploadProgress?: number;
  error?: string;
  uploadedUrl?: string;
  sortOrder?: number;
}

export interface ImageUploaderProps {
  /** Current images */
  images: ImageItem[];
  /** Called when images change (add, remove, reorder) */
  onImagesChange: (images: ImageItem[]) => void;
  /** Called when images should be uploaded */
  onUpload?: (images: ImageItem[]) => Promise<void>;
  /** Called when images are reordered (for persisting to database) */
  onReorder?: (imageIds: string[]) => Promise<void>;
  /** Called when an uploaded image should be deleted from database/CDN */
  onDelete?: (imageId: string) => Promise<{ success: boolean; error?: string }>;
  /** Maximum number of images allowed */
  maxImages?: number;
  /** Maximum file size in bytes (default 5MB) */
  maxFileSize?: number;
  /** Accepted file types */
  acceptedTypes?: string[];
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
  /** Label for accessibility */
  label?: string;
}
