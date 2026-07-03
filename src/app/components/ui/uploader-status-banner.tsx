/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { SpinnerRingCircle } from './spinners/spinner-ring-circle';

export interface UploaderStatusBannerProps {
  /** Status message to display next to the spinner; nothing renders when absent. */
  message?: string | null;
}

/**
 * Inline spinner + message banner shown while an uploader persists a change
 * (e.g. "Saving order..." or "Deleting..."). Renders nothing when `message` is
 * empty, so callers can pass a conditionally-computed message directly.
 */
export const UploaderStatusBanner = ({
  message,
}: UploaderStatusBannerProps): React.JSX.Element | null => {
  if (!message) return null;

  return (
    <div className="bg-muted/50 flex items-center justify-center gap-2 py-2 text-sm text-zinc-950">
      <SpinnerRingCircle size="sm" />
      <span>{message}</span>
    </div>
  );
};
