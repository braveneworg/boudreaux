/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId } from 'react';

import { Film, UploadCloud } from 'lucide-react';

import { useUploaderDrag } from '@/app/components/ui/use-uploader-drag';
import { VIDEO_ALLOWED_MIME_TYPES } from '@/lib/constants/video-uploads';
import { cn } from '@/lib/utils';

const ACCEPT = VIDEO_ALLOWED_MIME_TYPES.join(',');

interface VideoDropzoneProps {
  /** Accessible label for the file input and the click target. */
  label: string;
  hint: string;
  /** Invoked with the first selected/dropped file. */
  onFile: (file: File) => void;
  /** Render a slimmer control (used for the replace affordance). */
  compact?: boolean;
}

/**
 * Dashed drop zone + click-to-pick file input restricted to MP4/WebM. Shared by
 * the idle, retry, and replace states of the video file section.
 */
export const VideoDropzone = ({
  label,
  hint,
  onFile,
  compact = false,
}: VideoDropzoneProps): React.ReactElement => {
  const inputId = useId();

  const forwardFirst = (files: FileList | null): void => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  const { isDragOver, handleDrop, handleDragOver, handleDragLeave } = useUploaderDrag(forwardFirst);

  return (
    <div
      data-testid="video-dropzone"
      data-drag-over={isDragOver}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-none border-2 border-dashed p-6 text-center transition-colors',
        compact ? 'min-h-20' : 'min-h-32',
        isDragOver ? 'border-primary bg-muted/40' : 'border-input'
      )}
    >
      {compact ? (
        <Film className="size-5 text-zinc-700" aria-hidden />
      ) : (
        <UploadCloud className="size-8 text-zinc-700" aria-hidden />
      )}
      <label htmlFor={inputId} className="cursor-pointer text-sm font-medium underline">
        {label}
      </label>
      <p className="text-xs text-zinc-700">{hint}</p>
      <input
        id={inputId}
        type="file"
        accept={ACCEPT}
        aria-label={label}
        className="sr-only"
        onChange={(event) => forwardFirst(event.target.files)}
      />
    </div>
  );
};
