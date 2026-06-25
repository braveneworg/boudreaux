/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { FileAudio, FileVideo, Music } from 'lucide-react';

import { MediaItemCard } from './media-item-card';

import type { MediaItem, MediaType } from './media-uploader-types';

/**
 * The drop-zone icon for the given media type.
 */
export const MediaUploadIcon = ({ mediaType }: { mediaType: MediaType }): React.JSX.Element => {
  if (mediaType === 'audio') {
    return <FileAudio className="mb-2 h-10 w-10 text-zinc-950" />;
  }
  if (mediaType === 'video') {
    return <FileVideo className="mb-2 h-10 w-10 text-zinc-950" />;
  }
  return <Music className="mb-2 h-10 w-10 text-zinc-950" />;
};

interface MediaUploaderListProps {
  mediaItems: MediaItem[];
  isDisabled: boolean;
  onDeleteRequest: (item: MediaItem) => void;
}

/**
 * The list of media item cards. Renders nothing when there are no items.
 */
export const MediaUploaderList = ({
  mediaItems,
  isDisabled,
  onDeleteRequest,
}: MediaUploaderListProps): React.JSX.Element | null => {
  if (mediaItems.length === 0) return null;

  return (
    <div className="space-y-2">
      {mediaItems.map((item) => (
        <MediaItemCard
          key={item.id}
          item={item}
          onDeleteRequest={onDeleteRequest}
          disabled={isDisabled}
        />
      ))}
    </div>
  );
};
