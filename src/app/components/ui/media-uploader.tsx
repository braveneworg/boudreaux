'use client';

import { useCallback, useState, useRef, useId } from 'react';

import { FileAudio, FileVideo, Music, X, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Button } from './button';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { Progress } from './progress';
import { SpinnerRingCircle } from './spinners/spinner-ring-circle';

/**
 * Supported audio file types
 */
export const AUDIO_FILE_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/aiff',
  'audio/x-aiff',
  'audio/flac',
  'audio/x-flac',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/m4a',
  'audio/x-m4a',
] as const;

/**
 * Supported video file types
 */
export const VIDEO_FILE_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/mpeg',
  'video/3gpp',
  'video/x-matroska',
] as const;

/**
 * All supported media file types
 */
export const ALL_MEDIA_FILE_TYPES = [...AUDIO_FILE_TYPES, ...VIDEO_FILE_TYPES] as const;

export type MediaType = 'audio' | 'video' | 'all';

/**
 * Represents a media item in the uploader
 */
export interface MediaItem {
  id: string;
  file?: File;
  fileName: string;
  fileSize: number;
  fileType: string;
  mediaType: 'audio' | 'video';
  duration?: number;
  isUploading?: boolean;
  uploadProgress?: number;
  error?: string;
  uploadedUrl?: string;
}

export interface MediaUploaderProps {
  /** Current media items */
  mediaItems: MediaItem[];
  /** Called when media items change (add, remove) */
  onMediaChange: (items: MediaItem[]) => void;
  /** Called when media should be uploaded */
  onUpload?: (items: MediaItem[]) => Promise<void>;
  /** Called when an uploaded media should be deleted */
  onDelete?: (itemId: string) => Promise<{ success: boolean; error?: string }>;
  /** Type of media to accept ('audio', 'video', or 'all') */
  mediaType?: MediaType;
  /** Maximum number of files allowed */
  maxFiles?: number;
  /** Maximum file size in bytes (default 100MB) */
  maxFileSize?: number;
  /** Whether multiple files can be selected */
  multiple?: boolean;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
  /** Label for accessibility */
  label?: string;
}

interface MediaItemCardProps {
  item: MediaItem;
  onDeleteRequest: (item: MediaItem) => void;
  disabled?: boolean;
}

/**
 * Format file size for display
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

/**
 * Get media type icon
 */
const MediaIcon = ({
  mediaType,
  className,
}: {
  mediaType: 'audio' | 'video';
  className?: string;
}) => {
  if (mediaType === 'video') {
    return <FileVideo className={className} />;
  }
  return <FileAudio className={className} />;
};

const MediaItemCard = ({ item, onDeleteRequest, disabled }: MediaItemCardProps) => {
  const isInteractive = !item.isUploading && !disabled;

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors',
        item.error && 'border-destructive bg-destructive/5',
        item.uploadedUrl && !item.isUploading && 'border-green-500/50 bg-green-500/5'
      )}
    >
      {/* Media type icon */}
      <div
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
          item.mediaType === 'audio' ? 'bg-primary/10' : 'bg-purple-500/10'
        )}
      >
        <MediaIcon
          mediaType={item.mediaType}
          className={cn('h-6 w-6', item.mediaType === 'audio' ? 'text-primary' : 'text-purple-500')}
        />
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={item.fileName}>
          {item.fileName}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatFileSize(item.fileSize)}</span>
          {item.duration && (
            <>
              <span>•</span>
              <span>{formatDuration(item.duration)}</span>
            </>
          )}
          <span>•</span>
          <span className="capitalize">{item.mediaType}</span>
        </div>

        {/* Upload progress */}
        {item.isUploading && item.uploadProgress !== undefined && (
          <div className="mt-2">
            <Progress value={item.uploadProgress} className="h-1.5" />
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {Math.round(item.uploadProgress)}% uploaded
            </span>
          </div>
        )}

        {/* Error message */}
        {item.error && <p className="mt-1 text-xs text-destructive">{item.error}</p>}
      </div>

      {/* Status indicators */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Uploading spinner */}
        {item.isUploading && <SpinnerRingCircle size="sm" variant="primary" />}

        {/* Success indicator */}
        {item.uploadedUrl && !item.isUploading && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/90">
            <svg
              className="h-3.5 w-3.5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        )}

        {/* Delete button */}
        {isInteractive && (
          <button
            type="button"
            onClick={() => onDeleteRequest(item)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * MediaUploader component for uploading and managing audio/video files.
 *
 * Supports multiple audio and video formats for track uploads.
 */
export const MediaUploader = ({
  mediaItems,
  onMediaChange,
  onUpload,
  onDelete,
  mediaType = 'all',
  maxFiles = 10,
  maxFileSize = 100 * 1024 * 1024, // 100MB default
  multiple = true,
  disabled = false,
  className,
  label = 'Upload media files',
}: MediaUploaderProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
  const inputId = useId();

  // Determine accepted file types based on mediaType prop
  const acceptedTypes = useCallback(() => {
    switch (mediaType) {
      case 'audio':
        return [...AUDIO_FILE_TYPES];
      case 'video':
        return [...VIDEO_FILE_TYPES];
      default:
        return [...ALL_MEDIA_FILE_TYPES];
    }
  }, [mediaType])();

  const handleDeleteRequest = useCallback((item: MediaItem) => {
    setItemToDelete(item);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setItemToDelete(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!itemToDelete) return;

    // If this is an uploaded item and we have an onDelete callback, call it
    if (itemToDelete.uploadedUrl && onDelete) {
      setIsDeleting(true);
      try {
        const result = await onDelete(itemToDelete.id);
        if (!result.success) {
          console.error('Failed to delete media from server:', result.error);
        }
      } catch (error) {
        console.error('Error deleting media from server:', error);
      } finally {
        setIsDeleting(false);
      }
    }

    // Remove from local state
    onMediaChange(mediaItems.filter((item) => item.id !== itemToDelete.id));
    setItemToDelete(null);
  }, [itemToDelete, mediaItems, onMediaChange, onDelete]);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!acceptedTypes.includes(file.type as (typeof acceptedTypes)[number])) {
        return `Invalid file type. Accepted: audio and video files`;
      }
      if (file.size > maxFileSize) {
        return `File too large. Max size: ${Math.round(maxFileSize / 1024 / 1024)}MB`;
      }
      return null;
    },
    [acceptedTypes, maxFileSize]
  );

  const getMediaDuration = useCallback((file: File): Promise<number | undefined> => {
    return new Promise((resolve) => {
      const mediaElement = file.type.startsWith('video/')
        ? document.createElement('video')
        : document.createElement('audio');

      mediaElement.preload = 'metadata';

      mediaElement.onloadedmetadata = () => {
        URL.revokeObjectURL(mediaElement.src);
        resolve(Math.round(mediaElement.duration));
      };

      mediaElement.onerror = () => {
        URL.revokeObjectURL(mediaElement.src);
        resolve(undefined);
      };

      mediaElement.src = URL.createObjectURL(file);
    });
  }, []);

  const createMediaItem = useCallback(
    async (file: File): Promise<MediaItem> => {
      const error = validateFile(file);
      const duration = error ? undefined : await getMediaDuration(file);

      return {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        mediaType: file.type.startsWith('video/') ? 'video' : 'audio',
        duration,
        error: error || undefined,
      };
    },
    [validateFile, getMediaDuration]
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || disabled) return;

      const remainingSlots = maxFiles - mediaItems.length;
      if (remainingSlots <= 0) return;

      const newFiles = Array.from(files).slice(0, remainingSlots);
      const newItems = await Promise.all(newFiles.map(createMediaItem));

      onMediaChange([...mediaItems, ...newItems]);
    },
    [mediaItems, maxFiles, disabled, createMediaItem, onMediaChange]
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

  const handleUploadClick = useCallback(() => {
    if (onUpload && mediaItems.length > 0) {
      const itemsToUpload = mediaItems.filter((item) => !item.uploadedUrl && !item.error);
      if (itemsToUpload.length > 0) {
        onUpload(itemsToUpload);
      }
    }
  }, [onUpload, mediaItems]);

  const canAddMore = mediaItems.length < maxFiles && !disabled;
  const hasUnuploadedItems = mediaItems.some(
    (item) => !item.uploadedUrl && !item.error && item.file
  );
  const isUploading = mediaItems.some((item) => item.isUploading);
  const isDisabled = disabled || isDeleting;

  const getAcceptedTypesDisplay = () => {
    switch (mediaType) {
      case 'audio':
        return 'MP3, WAV, FLAC, AAC, OGG, M4A';
      case 'video':
        return 'MP4, WebM, MOV, AVI, MKV';
      default:
        return 'Audio & Video files';
    }
  };

  const getUploadIcon = () => {
    switch (mediaType) {
      case 'audio':
        return <FileAudio className="mb-2 h-10 w-10 text-muted-foreground" />;
      case 'video':
        return <FileVideo className="mb-2 h-10 w-10 text-muted-foreground" />;
      default:
        return <Music className="mb-2 h-10 w-10 text-muted-foreground" />;
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Deleting indicator */}
      {isDeleting && (
        <div className="flex items-center justify-center gap-2 rounded-md bg-muted/50 py-2 text-sm text-muted-foreground">
          <SpinnerRingCircle size="sm" />
          <span>Deleting...</span>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'relative flex min-h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors',
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
          multiple={multiple}
          onChange={handleInputChange}
          disabled={isDisabled || !canAddMore}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={label}
        />
        {getUploadIcon()}
        <p className="text-center text-sm text-muted-foreground">
          {canAddMore ? (
            <>
              <span className="font-medium text-foreground">Click to upload</span> or drag and drop
              <br />
              <span className="text-xs">
                {getAcceptedTypesDisplay()} up to {Math.round(maxFileSize / 1024 / 1024)}MB
              </span>
            </>
          ) : (
            <>Maximum {maxFiles} files reached</>
          )}
        </p>
        {mediaItems.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {mediaItems.length} / {maxFiles} files
          </p>
        )}
      </div>

      {/* Media items list */}
      {mediaItems.length > 0 && (
        <div className="space-y-2">
          {mediaItems.map((item) => (
            <MediaItemCard
              key={item.id}
              item={item}
              onDeleteRequest={handleDeleteRequest}
              disabled={isDisabled}
            />
          ))}
        </div>
      )}

      {/* Upload button */}
      {onUpload && hasUnuploadedItems && (
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
              <>
                Upload {mediaItems.filter((item) => !item.uploadedUrl && !item.error).length} Files
              </>
            )}
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!itemToDelete} onOpenChange={handleCancelDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Delete File</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this file? This action cannot be undone.
          </p>
          {itemToDelete && (
            <div className="my-4 flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  itemToDelete.mediaType === 'audio' ? 'bg-primary/10' : 'bg-purple-500/10'
                )}
              >
                <MediaIcon
                  mediaType={itemToDelete.mediaType}
                  className={cn(
                    'h-5 w-5',
                    itemToDelete.mediaType === 'audio' ? 'text-primary' : 'text-purple-500'
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{itemToDelete.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(itemToDelete.fileSize)}
                </p>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleCancelDelete}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
