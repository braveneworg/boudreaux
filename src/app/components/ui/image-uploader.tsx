'use client';

import { useCallback, useState, useRef, useId } from 'react';

import Image from 'next/image';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ImagePlus, X, GripVertical } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Button } from './button';
import { Progress } from './progress';
import { SpinnerRingCircle } from './spinners/spinner-ring-circle';
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

interface SortableImageItemProps {
  item: ImageItem;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

const SortableImageItem = ({ item, onRemove, disabled }: SortableImageItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: disabled || item.isUploading,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isInteractive = !item.isUploading && !disabled;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative aspect-square overflow-hidden rounded-lg border bg-muted',
        isDragging && 'z-50 opacity-80 shadow-lg',
        item.error && 'border-destructive',
        item.isUploading && 'pointer-events-none'
      )}
    >
      {/* Draggable overlay - covers entire thumbnail on mobile for easier dragging */}
      {isInteractive && (
        <div
          className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing sm:pointer-events-none"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        />
      )}

      {/* Image preview - using next/image for blob URLs requires unoptimized */}
      <Image
        src={item.preview}
        alt={item.altText || 'Uploaded image'}
        fill
        className="object-cover"
        unoptimized={item.preview.startsWith('blob:')}
      />

      {/* Uploading overlay */}
      {item.isUploading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-sm">
          <SpinnerRingCircle size="md" variant="primary" />
          {item.uploadProgress !== undefined && (
            <div className="w-3/4">
              <Progress value={item.uploadProgress} className="h-1.5" />
              <span className="mt-1 block text-center text-xs text-muted-foreground">
                {Math.round(item.uploadProgress)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error indicator */}
      {item.error && (
        <div className="absolute inset-x-0 bottom-0 bg-destructive/90 px-2 py-1 text-xs text-destructive-foreground">
          {item.error}
        </div>
      )}

      {/* Drag handle icon - visual indicator, desktop uses this for dragging */}
      {isInteractive && (
        <div
          className="pointer-events-none absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 shadow-sm backdrop-blur-sm sm:pointer-events-auto sm:cursor-grab sm:opacity-0 sm:transition-opacity sm:hover:bg-background sm:group-hover:opacity-100 sm:active:cursor-grabbing"
          {...(typeof window !== 'undefined' && window.innerWidth >= 640
            ? { ...attributes, ...listeners }
            : {})}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}

      {/* Delete button - always visible on mobile, hover on desktop */}
      {isInteractive && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          className="absolute right-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-destructive/90 text-destructive-foreground shadow-sm transition-opacity hover:bg-destructive sm:opacity-0 sm:group-hover:opacity-100"
          aria-label="Remove image"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Success indicator */}
      {item.uploadedUrl && !item.isUploading && (
        <div className="absolute bottom-1 left-1 rounded-full bg-green-500/90 p-1">
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  );
};

/**
 * ImageUploader component for uploading and managing multiple images
 * with drag-and-drop reordering support.
 *
 * Mobile-first design with responsive grid layout.
 */
export const ImageUploader = ({
  images,
  onImagesChange,
  onUpload,
  onReorder,
  maxImages = 10,
  maxFileSize = 5 * 1024 * 1024, // 5MB
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  disabled = false,
  className,
  label = 'Upload images',
}: ImageUploaderProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const inputId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = images.findIndex((item) => item.id === active.id);
        const newIndex = images.findIndex((item) => item.id === over.id);
        const reorderedImages = arrayMove(images, oldIndex, newIndex);

        // Update local state with new sort orders
        const updatedImages = reorderedImages.map((img, index) => ({
          ...img,
          sortOrder: index,
        }));
        onImagesChange(updatedImages);

        // If onReorder callback is provided and we have uploaded images, persist to database
        if (onReorder) {
          const uploadedImageIds = updatedImages
            .filter((img) => img.uploadedUrl)
            .map((img) => img.id);

          if (uploadedImageIds.length > 0) {
            setIsReordering(true);
            try {
              await onReorder(uploadedImageIds);
            } catch (error) {
              console.error('Failed to persist image order:', error);
            } finally {
              setIsReordering(false);
            }
          }
        }
      }
    },
    [images, onImagesChange, onReorder]
  );

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!acceptedTypes.includes(file.type)) {
        return `Invalid file type. Accepted: ${acceptedTypes.join(', ')}`;
      }
      if (file.size > maxFileSize) {
        return `File too large. Max size: ${Math.round(maxFileSize / 1024 / 1024)}MB`;
      }
      return null;
    },
    [acceptedTypes, maxFileSize]
  );

  const createImageItem = useCallback(
    (file: File): ImageItem => {
      const error = validateFile(file);
      return {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        preview: URL.createObjectURL(file),
        error: error || undefined,
      };
    },
    [validateFile]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || disabled) return;

      const remainingSlots = maxImages - images.length;
      if (remainingSlots <= 0) return;

      const newFiles = Array.from(files).slice(0, remainingSlots);
      const newImages = newFiles.map(createImageItem);

      onImagesChange([...images, ...newImages]);
    },
    [images, maxImages, disabled, createImageItem, onImagesChange]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(event.target.files);
      // Reset input value to allow selecting the same file again
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [handleFiles]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleRemove = useCallback(
    (id: string) => {
      const itemToRemove = images.find((item) => item.id === id);
      if (itemToRemove?.preview && !itemToRemove.uploadedUrl) {
        URL.revokeObjectURL(itemToRemove.preview);
      }
      onImagesChange(images.filter((item) => item.id !== id));
    },
    [images, onImagesChange]
  );

  const handleUploadClick = useCallback(() => {
    if (onUpload && images.length > 0) {
      const imagesToUpload = images.filter((img) => !img.uploadedUrl && !img.error);
      if (imagesToUpload.length > 0) {
        onUpload(imagesToUpload);
      }
    }
  }, [onUpload, images]);

  const canAddMore = images.length < maxImages && !disabled;
  const hasUnuploadedImages = images.some((img) => !img.uploadedUrl && !img.error && img.file);
  const isUploading = images.some((img) => img.isUploading);
  const isDisabled = disabled || isReordering;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Reordering indicator */}
      {isReordering && (
        <div className="flex items-center justify-center gap-2 rounded-md bg-muted/50 py-2 text-sm text-muted-foreground">
          <SpinnerRingCircle size="sm" />
          <span>Saving order...</span>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'relative flex min-h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors',
          isDragOver && 'border-primary bg-primary/5',
          !isDragOver && 'border-muted-foreground/25 hover:border-muted-foreground/50',
          isDisabled && 'cursor-not-allowed opacity-50',
          !canAddMore && 'pointer-events-none opacity-50'
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={acceptedTypes.join(',')}
          multiple
          onChange={handleInputChange}
          disabled={isDisabled || !canAddMore}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={label}
        />
        <ImagePlus className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-center text-sm text-muted-foreground">
          {canAddMore ? (
            <>
              <span className="font-medium text-foreground">Click to upload</span> or drag and drop
              <br />
              <span className="text-xs">
                {acceptedTypes.map((t) => t.replace('image/', '')).join(', ')} up to{' '}
                {Math.round(maxFileSize / 1024 / 1024)}MB
              </span>
            </>
          ) : (
            <>Maximum {maxImages} images reached</>
          )}
        </p>
        {images.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {images.length} / {maxImages} images
          </p>
        )}
      </div>

      {/* Image grid with drag and drop */}
      {images.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={isReordering ? undefined : handleDragEnd}
        >
          <SortableContext items={images.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div
              className={cn(
                'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6',
                isReordering && 'pointer-events-none opacity-50'
              )}
            >
              {images.map((item) => (
                <SortableImageItem
                  key={item.id}
                  item={item}
                  onRemove={handleRemove}
                  disabled={isDisabled}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Upload button */}
      {onUpload && hasUnuploadedImages && (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleUploadClick}
            disabled={isDisabled || isUploading}
            size="sm"
          >
            {isUploading ? (
              <>
                <SpinnerRingCircle size="sm" className="mr-2" />
                Uploading...
              </>
            ) : (
              <>Upload {images.filter((img) => !img.uploadedUrl && !img.error).length} Images</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
