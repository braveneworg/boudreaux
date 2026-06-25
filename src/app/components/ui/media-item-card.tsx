/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

import { MediaIcon } from './media-icon';
import { formatDuration, formatFileSize } from './media-uploader-utils';
import { Progress } from './progress';
import { SpinnerRingCircle } from './spinners/spinner-ring-circle';

import type { MediaItem } from './media-uploader-types';

interface MediaItemCardProps {
  item: MediaItem;
  onDeleteRequest: (item: MediaItem) => void;
  disabled?: boolean;
}

/** Container classes reflecting error / uploaded state. */
const cardContainerClass = (item: MediaItem): string =>
  cn(
    'group bg-card relative flex items-center gap-3 rounded-lg border p-3 transition-colors',
    item.error && 'border-destructive bg-destructive/5',
    item.uploadedUrl && !item.isUploading && 'border-green-500/50 bg-green-500/5'
  );

const iconWrapperClass = (mediaType: MediaItem['mediaType']): string =>
  cn(
    'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
    mediaType === 'audio' ? 'bg-primary/10' : 'bg-purple-500/10'
  );

const iconClass = (mediaType: MediaItem['mediaType']): string =>
  cn('h-6 w-6', mediaType === 'audio' ? 'text-primary' : 'text-purple-500');

const MediaUploadProgress = ({ item }: { item: MediaItem }): React.JSX.Element | null => {
  if (!item.isUploading || item.uploadProgress === undefined) return null;

  return (
    <div className="mt-2">
      <Progress value={item.uploadProgress} className="h-1.5" />
      <span className="mt-0.5 block text-xs text-zinc-950">
        {Math.round(item.uploadProgress)}% uploaded
      </span>
    </div>
  );
};

const MediaItemMeta = ({ item }: { item: MediaItem }): React.JSX.Element => (
  <div className="min-w-0 flex-1">
    <p className="truncate text-sm font-medium" title={item.fileName}>
      {item.fileName}
    </p>
    <div className="flex items-center gap-2 text-xs text-zinc-950">
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

    <MediaUploadProgress item={item} />

    {item.error && <p className="text-destructive mt-1 text-xs">{item.error}</p>}
  </div>
);

const MediaSuccessBadge = (): React.JSX.Element => (
  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/90">
    <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  </div>
);

interface MediaItemStatusProps {
  item: MediaItem;
  isInteractive: boolean;
  onDeleteRequest: (item: MediaItem) => void;
}

const MediaItemStatus = ({
  item,
  isInteractive,
  onDeleteRequest,
}: MediaItemStatusProps): React.JSX.Element => (
  <div className="flex shrink-0 items-center gap-2">
    {item.isUploading && <SpinnerRingCircle size="sm" variant="primary" />}

    {item.uploadedUrl && !item.isUploading && <MediaSuccessBadge />}

    {isInteractive && (
      <button
        type="button"
        onClick={() => onDeleteRequest(item)}
        className="bg-muted hover:bg-destructive flex h-8 w-8 items-center justify-center rounded-full text-zinc-950 transition-colors hover:text-white"
        aria-label="Remove file"
      >
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
);

/**
 * A single media file row showing its icon, metadata, upload progress, and
 * status/remove controls.
 */
export const MediaItemCard = ({
  item,
  onDeleteRequest,
  disabled,
}: MediaItemCardProps): React.JSX.Element => {
  const isInteractive = !item.isUploading && !disabled;

  return (
    <div className={cardContainerClass(item)}>
      <div className={iconWrapperClass(item.mediaType)}>
        <MediaIcon mediaType={item.mediaType} className={iconClass(item.mediaType)} />
      </div>

      <MediaItemMeta item={item} />

      <MediaItemStatus
        item={item}
        isInteractive={isInteractive}
        onDeleteRequest={onDeleteRequest}
      />
    </div>
  );
};
