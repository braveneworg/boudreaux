/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo, useState } from 'react';

import { DownloadIcon, Loader2 } from 'lucide-react';

import { MultiCombobox } from '@/app/components/forms/fields/multi-combobox';
import { Button } from '@/app/components/ui/button';
import { useReleaseDigitalFormatsQuery } from '@/app/hooks/use-release-digital-formats-query';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { FORMAT_LABELS } from '@/lib/constants/digital-formats';

interface AvailableFormat {
  formatType: string;
  fileName: string;
}

interface FormatBundleDownloadProps {
  releaseId: string;
  availableFormats: AvailableFormat[];
  downloadCount: number;
  onDownloadComplete?: () => void;
}

/**
 * FormatBundleDownload — multi-select format picker with a bundle download
 * button. Clicking the button navigates the current tab to the bundle API,
 * which streams back a 302 redirect to a presigned S3 URL with
 * Content-Disposition: attachment so the browser downloads the ZIP without
 * leaving the page.
 *
 * Why synchronous navigation (not fetch → open):
 * iOS Safari only honors `window.open` / `location` changes triggered
 * directly by a user gesture. Any navigation that runs after `await` is
 * treated as programmatic and silently blocked, so the download button
 * must navigate within the click handler itself — no async in between.
 */
export const FormatBundleDownload = ({
  releaseId,
  availableFormats: initialFormats,
  downloadCount,
  onDownloadComplete,
}: FormatBundleDownloadProps) => {
  const { isPending: isLoadingFormats, data: formatsData } = useReleaseDigitalFormatsQuery(
    releaseId,
    { enabled: initialFormats.length === 0 }
  );
  const formats = initialFormats.length > 0 ? initialFormats : (formatsData?.formats ?? null);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  const resolvedFormats = formats ?? [];
  const isLoadingFormatsResolved = initialFormats.length > 0 ? false : isLoadingFormats;
  const atLimit = downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT;
  const hasSelection = selectedFormats.length > 0;

  const comboboxOptions = useMemo(
    () =>
      (formats ?? []).map(({ formatType }) => ({
        value: formatType,
        label: FORMAT_LABELS[formatType] ?? formatType,
      })),
    [formats]
  );

  const handleDownload = () => {
    if (!hasSelection || atLimit || isDownloading) return;

    const joined = selectedFormats.join(',');
    const apiUrl = `/api/releases/${releaseId}/download/bundle?formats=${joined}`;

    setIsDownloading(true);
    window.open(apiUrl, '_self');

    setTimeout(() => {
      setIsDownloading(false);
      onDownloadComplete?.();
    }, 3000);
  };

  if (isLoadingFormatsResolved) {
    return (
      <div className="flex items-center justify-center py-4" role="status">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  if (resolvedFormats.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No digital formats available for download.</p>
    );
  }

  return (
    <div className="space-y-4">
      <MultiCombobox
        options={comboboxOptions}
        value={selectedFormats}
        onValueChange={setSelectedFormats}
        placeholder="Select formats..."
        emptyMessage="No formats found."
        disabled={atLimit}
      />

      <Button
        className="w-full"
        type="button"
        disabled={!hasSelection || atLimit || isDownloading}
        onClick={handleDownload}
      >
        {isDownloading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Preparing download...
          </>
        ) : (
          <>
            <DownloadIcon className="size-4" />
            {hasSelection
              ? `Download ${selectedFormats.length} ${selectedFormats.length === 1 ? 'format' : 'formats'}`
              : 'Select at least one format'}
          </>
        )}
      </Button>
    </div>
  );
};
