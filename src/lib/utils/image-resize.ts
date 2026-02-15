/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Utility for resizing images on the client side before upload
 * This helps reduce upload time and storage costs while maintaining quality
 */

export interface ResizeOptions {
  /** Target width in pixels */
  maxWidth: number;
  /** Target height in pixels (optional, maintains aspect ratio if not provided) */
  maxHeight?: number;
  /** Output quality for JPEG/WebP (0-1), default 0.9 */
  quality?: number;
  /** Output format, defaults to original format or JPEG */
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface ResizeResult {
  /** The resized image as a File object */
  file: File;
  /** Original width */
  originalWidth: number;
  /** Original height */
  originalHeight: number;
  /** New width after resize */
  newWidth: number;
  /** New height after resize */
  newHeight: number;
  /** Whether the image was actually resized (false if already smaller) */
  wasResized: boolean;
}

/**
 * Load an image file into an HTMLImageElement
 */
const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(new Error(`Failed to load image: ${error}`));
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Get the output MIME type based on input file and options
 */
const getOutputMimeType = (
  inputFile: File,
  format?: 'image/jpeg' | 'image/png' | 'image/webp'
): 'image/jpeg' | 'image/png' | 'image/webp' => {
  if (format) return format;

  // Map input type to supported output type
  const inputType = inputFile.type.toLowerCase();

  if (inputType === 'image/png') return 'image/png';
  if (inputType === 'image/webp') return 'image/webp';

  // Default to JPEG for other formats (including GIF, TIFF)
  return 'image/jpeg';
};

/**
 * Get the file extension for a MIME type
 */
const getFileExtension = (mimeType: string): string => {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/jpeg':
    default:
      return 'jpg';
  }
};

/**
 * Resize an image file to the specified dimensions
 * Maintains aspect ratio and only resizes if the image is larger than target
 *
 * @param file - The image file to resize
 * @param options - Resize options including maxWidth, maxHeight, quality, format
 * @returns Promise<ResizeResult> - The resized image and metadata
 */
export const resizeImage = async (file: File, options: ResizeOptions): Promise<ResizeResult> => {
  const { maxWidth, maxHeight, quality = 0.9, format } = options;

  // Load the image to get dimensions
  const img = await loadImage(file);
  const originalWidth = img.naturalWidth;
  const originalHeight = img.naturalHeight;

  // Calculate new dimensions while maintaining aspect ratio
  let newWidth = originalWidth;
  let newHeight = originalHeight;
  let wasResized = false;

  // Only resize if image is larger than target
  if (originalWidth > maxWidth) {
    const ratio = maxWidth / originalWidth;
    newWidth = maxWidth;
    newHeight = Math.round(originalHeight * ratio);
    wasResized = true;
  }

  // Check height constraint if provided
  if (maxHeight && newHeight > maxHeight) {
    const ratio = maxHeight / newHeight;
    newHeight = maxHeight;
    newWidth = Math.round(newWidth * ratio);
    wasResized = true;
  }

  // If no resize needed, return original file with metadata
  if (!wasResized) {
    URL.revokeObjectURL(img.src);
    return {
      file,
      originalWidth,
      originalHeight,
      newWidth: originalWidth,
      newHeight: originalHeight,
      wasResized: false,
    };
  }

  // Create canvas and resize
  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(img.src);
    throw new Error('Failed to get canvas context');
  }

  // Use high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw the resized image
  ctx.drawImage(img, 0, 0, newWidth, newHeight);

  // Clean up the object URL
  URL.revokeObjectURL(img.src);

  // Convert canvas to blob
  const outputMimeType = getOutputMimeType(file, format);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) {
          resolve(b);
        } else {
          reject(new Error('Failed to create image blob'));
        }
      },
      outputMimeType,
      quality
    );
  });

  // Create new filename with correct extension
  const extension = getFileExtension(outputMimeType);
  const originalName = file.name.replace(/\.[^/.]+$/, '');
  const newFileName = `${originalName}-${newWidth}w.${extension}`;

  // Create new File object
  const resizedFile = new File([blob], newFileName, {
    type: outputMimeType,
    lastModified: Date.now(),
  });

  return {
    file: resizedFile,
    originalWidth,
    originalHeight,
    newWidth,
    newHeight,
    wasResized: true,
  };
};

/**
 * Resize an image to a specific width for notification banners (880px)
 * This is a convenience function with preset options
 *
 * @param file - The image file to resize
 * @returns Promise<ResizeResult> - The resized image and metadata
 */
export const resizeNotificationBannerImage = async (file: File): Promise<ResizeResult> => {
  return resizeImage(file, {
    maxWidth: 880,
    quality: 0.9,
    format: 'image/jpeg', // Convert all to JPEG for consistency and smaller file sizes
  });
};
