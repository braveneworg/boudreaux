/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { FileAudio, FileVideo } from 'lucide-react';

interface MediaIconProps {
  mediaType: 'audio' | 'video';
  className?: string;
}

/**
 * Renders the appropriate file icon for an audio or video media item.
 */
export const MediaIcon = ({ mediaType, className }: MediaIconProps): React.JSX.Element => {
  if (mediaType === 'video') {
    return <FileVideo className={className} />;
  }
  return <FileAudio className={className} />;
};
