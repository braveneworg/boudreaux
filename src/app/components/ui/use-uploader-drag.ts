/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

/**
 * Drag-and-drop state and handlers shared by the image and media uploaders.
 *
 * Tracks whether files are currently being dragged over the drop zone and wires
 * up the drop/drag-over/drag-leave handlers, forwarding any dropped files to the
 * supplied callback.
 *
 * @param onFiles - invoked with the dropped `FileList` (or `null`) on drop.
 * @returns the current `isDragOver` flag and the three drag event handlers.
 */
export interface UploaderDragHandlers {
  isDragOver: boolean;
  handleDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
}

export const useUploaderDrag = (
  onFiles: (files: FileList | null) => void
): UploaderDragHandlers => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
      onFiles(event.dataTransfer.files);
    },
    [onFiles]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  return { isDragOver, handleDrop, handleDragOver, handleDragLeave };
};
