/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import { DownloadIcon, Loader2 } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { FORMAT_LABELS } from '@/lib/constants/digital-formats';

interface AvailableFormat {
  formatType: string;
  fileName: string;
}

interface FormatBundleDownloadProps {
  releaseId: string;
  releaseTitle: string;
  availableFormats: AvailableFormat[];
  downloadCount: number;
  onDownloadStarted?: () => void;
}

/**
 * FormatBundleDownload — multi-select format picker with a bundle download
 * button. Uses ToggleGroup (type="multiple") for mobile-friendly format
 * selection and triggers a ZIP download of all selected formats via the
 * bundle API route.
 */
export const FormatBundleDownload = ({
  releaseId,
  _releaseTitle,
  availableFormats,
  downloadCount,
  onDownloadStarted,
}: FormatBundleDownloadProps) => {
  const allFormatTypes = availableFormats.map((f) => f.formatType);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(allFormatTypes);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atLimit = downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT;
  const hasSelection = selectedFormats.length > 0;

  const handleDownload = useCallback(() => {
    if (!hasSelection || atLimit) return;

    setIsDownloading(true);
    setError(null);

    const formats = selectedFormats.join(',');
    const url = `/api/releases/${releaseId}/download/bundle?formats=${formats}`;

    // Use window.open for reliable downloads on all platforms
    // (iOS Safari ignores the download attribute on programmatic anchors).
    // The API returns Content-Disposition: attachment, so the browser treats
    // it as a file download rather than a navigation.
    window.open(url, '_self');

    // Notify the parent (e.g. dialog) that the download has started
    onDownloadStarted?.();

    // Reset loading state after a reasonable delay
    // (browser handles the actual download natively)
    setTimeout(() => {
      setIsDownloading(false);
    }, 3000);
  }, [hasSelection, atLimit, selectedFormats, releaseId, onDownloadStarted]);

  if (availableFormats.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No digital formats available for download.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Select formats:</p>
      </div>

      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        value={selectedFormats}
        onValueChange={setSelectedFormats}
        className="flex flex-wrap gap-2"
      >
        {availableFormats.map(({ formatType }) => (
          <ToggleGroupItem
            key={formatType}
            value={formatType}
            aria-label={`Select ${FORMAT_LABELS[formatType] ?? formatType}`}
            className="rounded-md px-3"
            disabled={atLimit}
          >
            {FORMAT_LABELS[formatType] ?? formatType}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

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
