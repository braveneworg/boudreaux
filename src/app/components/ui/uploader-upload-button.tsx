/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Button } from './button';
import { SpinnerRingCircle } from './spinners/spinner-ring-circle';

export interface UploaderUploadButtonProps {
  /** Click handler that triggers the upload. */
  onClick: () => void;
  /** Whether the button is disabled. */
  disabled: boolean;
  /** Whether an upload is currently in progress. */
  isUploading: boolean;
  /** Count of pending items, shown in the idle label. */
  pendingCount: number;
  /** Noun for the idle label, e.g. "Images" or "Files". */
  noun: string;
}

/**
 * Shared "Upload N {noun}" action button used by the image and media uploaders.
 * Shows a spinner and "Uploading..." while an upload is in progress.
 */
export const UploaderUploadButton = ({
  onClick,
  disabled,
  isUploading,
  pendingCount,
  noun,
}: UploaderUploadButtonProps): React.JSX.Element => (
  <div className="flex justify-end">
    <Button type="button" onClick={onClick} disabled={disabled} size="sm">
      {isUploading ? (
        <>
          <SpinnerRingCircle size="sm" className="mr-2" />
          Uploading...
        </>
      ) : (
        <>
          Upload {pendingCount} {noun}
        </>
      )}
    </Button>
  </div>
);
