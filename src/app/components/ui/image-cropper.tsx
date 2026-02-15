/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';

// Golden ratio for notification banners (approximately 1.618:1)
// For 880px width: 880 / 1.618 ≈ 544
export const GOLDEN_RATIO = 1.618;
export const BANNER_WIDTH = 880;
export const BANNER_HEIGHT = Math.round(BANNER_WIDTH / GOLDEN_RATIO); // ~544px

/** Crop area in pixels - compatible with the old interface */
export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropResult {
  /** The cropped image as a Blob */
  blob: Blob;
  /** Crop area in pixels */
  croppedAreaPixels: Area;
  /** Background color if padding was needed */
  backgroundColor?: string;
}

interface ImageCropperProps {
  /** The image URL to crop */
  imageSrc: string;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Callback when crop is confirmed */
  onCropComplete: (result: CropResult) => void;
  /** Target aspect ratio (default: golden ratio ~1.618:1). Set to undefined for free-form cropping. */
  aspectRatio?: number;
  /** Whether to lock the aspect ratio (default: false - allows height adjustment) */
  lockAspectRatio?: boolean;
  /** Initial background color value */
  initialBackgroundColor?: string;
}

/**
 * Creates a centered crop with the given aspect ratio
 */
const createCenteredCrop = (mediaWidth: number, mediaHeight: number, aspect: number): Crop => {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
};

/**
 * Creates a cropped image from canvas
 * @param imageSrc - The source image URL
 * @param pixelCrop - The crop area in pixels (relative to displayed image)
 * @param targetWidth - The target output width
 * @param targetHeight - The target output height
 * @param scaleX - Scale factor from displayed to natural width
 * @param scaleY - Scale factor from displayed to natural height
 * @param backgroundColor - Optional background color
 */
const createCroppedImage = async (
  imageSrc: string,
  pixelCrop: PixelCrop,
  targetWidth: number,
  targetHeight: number,
  scaleX: number,
  scaleY: number,
  backgroundColor?: string
): Promise<Blob> => {
  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = imageSrc;
  });

  // Scale crop coordinates from displayed size to natural image size
  const naturalCrop = {
    x: pixelCrop.x * scaleX,
    y: pixelCrop.y * scaleY,
    width: pixelCrop.width * scaleX,
    height: pixelCrop.height * scaleY,
  };

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Fill background color if provided
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

  // Enable high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Calculate the scale to fit the cropped area into target dimensions
  const fitScaleX = targetWidth / naturalCrop.width;
  const fitScaleY = targetHeight / naturalCrop.height;
  const fitScale = Math.min(fitScaleX, fitScaleY);

  // Calculate dimensions to maintain aspect ratio
  const drawWidth = naturalCrop.width * fitScale;
  const drawHeight = naturalCrop.height * fitScale;

  // Center the image if it doesn't fill the entire canvas
  const offsetX = (targetWidth - drawWidth) / 2;
  const offsetY = (targetHeight - drawHeight) / 2;

  // Draw the cropped portion of the image using natural coordinates
  ctx.drawImage(
    image,
    naturalCrop.x,
    naturalCrop.y,
    naturalCrop.width,
    naturalCrop.height,
    offsetX,
    offsetY,
    drawWidth,
    drawHeight
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create image blob'));
        }
      },
      'image/jpeg',
      0.9
    );
  });
};

export function ImageCropper({
  imageSrc,
  open,
  onOpenChange,
  onCropComplete,
  aspectRatio = GOLDEN_RATIO,
  lockAspectRatio = false,
  initialBackgroundColor,
}: ImageCropperProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [backgroundColor, setBackgroundColor] = useState(initialBackgroundColor || '#000000');
  const [useBackgroundColor, setUseBackgroundColor] = useState(!!initialBackgroundColor);
  const [isProcessing, setIsProcessing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset state when dialog opens with new image
  useEffect(() => {
    if (open) {
      setCrop(undefined);
      setCompletedCrop(undefined);
      setBackgroundColor(initialBackgroundColor || '#000000');
      setUseBackgroundColor(!!initialBackgroundColor);
    }
  }, [open, initialBackgroundColor]);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      const initialCrop = createCenteredCrop(width, height, aspectRatio);
      setCrop(initialCrop);
    },
    [aspectRatio]
  );

  const handleConfirm = useCallback(async () => {
    if (!completedCrop || !imgRef.current) return;

    // Calculate scale factors between displayed and natural image size
    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    setIsProcessing(true);
    try {
      const blob = await createCroppedImage(
        imageSrc,
        completedCrop,
        BANNER_WIDTH,
        BANNER_HEIGHT,
        scaleX,
        scaleY,
        useBackgroundColor ? backgroundColor : undefined
      );

      // Convert PixelCrop to Area for compatibility (using natural coordinates)
      const croppedAreaPixels: Area = {
        x: completedCrop.x * scaleX,
        y: completedCrop.y * scaleY,
        width: completedCrop.width * scaleX,
        height: completedCrop.height * scaleY,
      };

      onCropComplete({
        blob,
        croppedAreaPixels,
        backgroundColor: useBackgroundColor ? backgroundColor : undefined,
      });
    } catch (error) {
      console.error('Failed to crop image:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [completedCrop, imageSrc, backgroundColor, useBackgroundColor, onCropComplete]);

  const handleCancel = useCallback(() => {
    setCrop(undefined);
    setCompletedCrop(undefined);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Crop Image</DialogTitle>
          <DialogDescription>
            Drag to position or resize by dragging any edge or corner. The image will be scaled to
            fit the banner dimensions ({BANNER_WIDTH}×{BANNER_HEIGHT}px).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cropper area */}
          <div
            className="relative flex h-[400px] w-full items-center justify-center rounded-lg"
            style={{ backgroundColor: useBackgroundColor ? backgroundColor : '#0a0a0a' }}
          >
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={lockAspectRatio ? aspectRatio : undefined}
              ruleOfThirds
              className="max-h-full max-w-full [&_.ReactCrop__crop-selection]:touch-none [&_.ReactCrop__drag-handle]:h-3 [&_.ReactCrop__drag-handle]:w-3 [&_.ReactCrop__drag-handle.ord-n]:-top-1.5! [&_.ReactCrop__drag-handle.ord-s]:-bottom-1.5! [&_.ReactCrop__drag-handle.ord-e]:-right-1.5! [&_.ReactCrop__drag-handle.ord-w]:-left-1.5! [&_.ReactCrop__drag-bar.ord-n]:h-2! [&_.ReactCrop__drag-bar.ord-s]:h-2! [&_.ReactCrop__drag-bar.ord-n]:-top-1! [&_.ReactCrop__drag-bar.ord-s]:-bottom-1! [&_.ReactCrop__drag-bar.ord-e]:w-2! [&_.ReactCrop__drag-bar.ord-w]:w-2! [&_.ReactCrop__drag-bar.ord-e]:-right-1! [&_.ReactCrop__drag-bar.ord-w]:-left-1!"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Crop preview"
                onLoad={onImageLoad}
                style={{ maxHeight: '380px', maxWidth: '100%' }}
                crossOrigin="anonymous"
              />
            </ReactCrop>
          </div>

          {/* Instructions */}
          <p className="text-sm text-muted-foreground">
            💡 <strong>Tip:</strong> Drag the top or bottom edges to adjust height, sides to adjust
            width, or corners to resize freely. Drag inside to reposition.
          </p>

          {/* Background color option */}
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="use-bg-color" className="cursor-pointer">
                Add background color (for images that don&apos;t fill the frame)
              </Label>
              <Switch
                id="use-bg-color"
                checked={useBackgroundColor}
                onCheckedChange={setUseBackgroundColor}
              />
            </div>

            {useBackgroundColor && (
              <div className="mt-3 flex items-center gap-3">
                <Label htmlFor="bg-color">Color:</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="bg-color"
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="h-10 w-14 cursor-pointer p-1"
                  />
                  <Input
                    type="text"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    placeholder="#000000"
                    className="w-28"
                    maxLength={7}
                  />
                </div>
                <div
                  className="h-8 w-8 rounded border"
                  style={{ backgroundColor }}
                  aria-label={`Background color preview: ${backgroundColor}`}
                />
              </div>
            )}
          </div>

          {/* Preview dimensions info */}
          <p className="text-sm text-muted-foreground">
            Final image size: {BANNER_WIDTH}×{BANNER_HEIGHT} pixels (golden ratio)
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isProcessing || !completedCrop}>
            {isProcessing ? 'Processing...' : 'Apply Crop'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
