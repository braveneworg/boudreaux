/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export type FormatDownloadStatus =
  | 'pending'
  | 'zipping'
  | 'done'
  | 'uploading'
  | 'complete'
  | 'error';

export interface FormatProgress {
  formatType: string;
  label: string;
  status: FormatDownloadStatus;
}

interface FormatProgressListProps {
  progress: FormatProgress[];
}

export const FormatProgressList = ({ progress }: FormatProgressListProps): React.ReactElement => (
  <ul className="space-y-1" role="status">
    {progress.map((fp) => (
      <li key={fp.formatType} className="flex items-center gap-2 text-sm">
        {fp.status === 'complete' || fp.status === 'done' ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        ) : fp.status === 'zipping' || fp.status === 'uploading' ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />
        ) : fp.status === 'error' ? (
          <AlertCircle className="text-destructive size-4 shrink-0" />
        ) : (
          <span className="size-4 shrink-0 text-center text-zinc-950">&bull;</span>
        )}
        <span
          className={
            fp.status === 'complete' || fp.status === 'done'
              ? 'text-emerald-600'
              : fp.status === 'error'
                ? 'text-destructive'
                : ''
          }
        >
          {fp.label}
        </span>
      </li>
    ))}
  </ul>
);
