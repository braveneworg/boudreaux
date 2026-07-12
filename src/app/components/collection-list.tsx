/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { AlertCircle, CheckCircle2, DownloadIcon, Loader2, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/app/components/ui/alert-dialog';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { useCollectionDownload } from '@/hooks/use-collection-download';
import { deletePurchaseAction } from '@/lib/actions/collection-actions';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { FORMAT_LABELS } from '@/lib/constants/digital-formats';
import { computeResetInHours } from '@/lib/utils/download-reset';
import { getReleaseCoverArt } from '@/lib/utils/release-helpers';

import { FormatProgressList } from './format-progress-list';

import type { FormatProgress } from './format-progress-list';

/**
 * Lookup map for format labels keyed by format type. Backed by a `Map` so
 * dynamic format-type keys are read without object-injection risk; falls back
 * to the raw format type when no label is registered.
 */
const FORMAT_LABEL_MAP = new Map(Object.entries(FORMAT_LABELS));
const getFormatLabel = (formatType: string): string =>
  FORMAT_LABEL_MAP.get(formatType) ?? formatType;

interface CollectionPurchase {
  id: string;
  amountPaid: number;
  currency: string;
  purchasedAt: Date;
  release: {
    id: string;
    title: string;
    coverArt: string;
    images: Array<{
      id: string;
      src: string | null;
      altText: string | null;
      sortOrder: number;
    }>;
    artistReleases: Array<{
      artist: {
        id: string;
        firstName: string;
        surname: string;
        displayName: string | null;
      };
    }>;
    digitalFormats: Array<{
      formatType: string;
      files: Array<{ fileName: string }>;
    }>;
    releaseDownloads: Array<{
      downloadCount: number;
      lastDownloadedAt: string | null;
    }>;
  };
}

interface CollectionListProps {
  purchases: CollectionPurchase[];
  isAdmin: boolean;
}

const getArtistName = (purchase: CollectionPurchase): string => {
  const artistRelease = purchase.release.artistReleases[0];
  if (!artistRelease) return 'Unknown Artist';
  const { displayName, firstName, surname } = artistRelease.artist;
  return displayName ?? [firstName, surname].filter(Boolean).join(' ');
};

const formatPrice = (amountCents: number, currency: string): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
};

export const CollectionList = ({ purchases, isAdmin }: CollectionListProps) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = useCallback(async (purchaseId: string) => {
    setDeletingId(purchaseId);
    try {
      const result = await deletePurchaseAction(purchaseId);
      if (!result.success) {
        console.error('Failed to delete purchase:', result.error);
      }
    } catch (error) {
      console.error('Failed to delete purchase:', error);
    } finally {
      setDeletingId(null);
    }
  }, []);

  return (
    <div className="grid gap-4">
      {purchases.map((purchase) => (
        <CollectionListItem
          key={purchase.id}
          purchase={purchase}
          isAdmin={isAdmin}
          isDeleting={deletingId === purchase.id}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
};

interface CollectionListItemProps {
  purchase: CollectionPurchase;
  isAdmin: boolean;
  isDeleting: boolean;
  onDelete: (purchaseId: string) => void;
}

/**
 * A single collection row. Memoized so that toggling another row's delete
 * spinner (the parent's `deletingId`) doesn't re-render every row — and, more
 * importantly, doesn't re-render each row's `CollectionDownloadDialog`, which
 * holds its own download/SSE state. Per-row derivations only recompute when
 * this row's own props change.
 */
const CollectionListItem = memo(
  ({ purchase, isAdmin, isDeleting, onDelete }: CollectionListItemProps) => {
    const artistName = getArtistName(purchase);
    const coverArt = getReleaseCoverArt(purchase.release);
    const downloadCount = purchase.release.releaseDownloads[0]?.downloadCount ?? 0;
    const lastDownloadedAt = purchase.release.releaseDownloads[0]?.lastDownloadedAt ?? null;
    const resetInHours =
      downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT ? computeResetInHours(lastDownloadedAt) : null;
    const availableFormats = purchase.release.digitalFormats
      .filter((f) => f.files.length > 0)
      .map((f) => ({
        formatType: f.formatType,
        fileName: f.files[0]?.fileName ?? '',
      }));

    return (
      <div className="shadow-zine-sm flex min-w-0 items-center gap-4 border-2 border-black bg-white p-4">
        {/* Cover Art */}
        <Link href={`/releases/${purchase.release.id}`} className="shrink-0">
          {coverArt ? (
            <Image
              src={coverArt.src}
              alt={coverArt.alt}
              width={80}
              height={80}
              className="size-20 object-cover"
            />
          ) : (
            <div className="flex size-20 items-center justify-center bg-zinc-200 text-xs text-zinc-400">
              No art
            </div>
          )}
        </Link>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <Link
            href={`/releases/${purchase.release.id}`}
            className="block truncate font-semibold text-zinc-900 hover:underline"
          >
            {purchase.release.title}
          </Link>
          <p className="truncate text-sm text-zinc-500">{artistName}</p>
          <p className="mt-1 text-xs text-zinc-400">
            {formatPrice(purchase.amountPaid, purchase.currency)}
            {' · '}
            {new Date(purchase.purchasedAt).toLocaleDateString()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <CollectionDownloadDialog
            releaseId={purchase.release.id}
            releaseTitle={purchase.release.title}
            availableFormats={availableFormats}
            downloadCount={downloadCount}
            resetInHours={resetInHours}
          />

          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  disabled={isDeleting}
                  aria-label={`Delete purchase for ${purchase.release.title}`}
                >
                  {isDeleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete purchase?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove the purchase record for{' '}
                    <strong>{purchase.release.title}</strong>. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(purchase.id)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    );
  }
);

CollectionListItem.displayName = 'CollectionListItem';

// ─── Download Dialog ────────────────────────────────────────────────────────

interface AvailableFormat {
  formatType: string;
  fileName: string;
}

interface DownloadFormatFormProps {
  availableFormats: AvailableFormat[];
  downloadCount: number;
  selectedFormats: string[];
  onValueChange: (formats: string[]) => void;
  isDownloading: boolean;
  formatProgress: FormatProgress[];
  downloadPhase: 'idle' | 'downloading' | 'complete' | 'error';
  downloadError: string | null;
  onDownload: () => void;
}

/** Active download form: format toggles, progress list, error banner, and download button. */
const DownloadFormatForm = ({
  availableFormats,
  downloadCount,
  selectedFormats,
  onValueChange,
  isDownloading,
  formatProgress,
  downloadPhase,
  downloadError,
  onDownload,
}: DownloadFormatFormProps) => {
  const hasSelection = selectedFormats.length > 0;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Select formats:</p>
        <p className="text-xs text-zinc-950">
          {downloadCount}/{MAX_RELEASE_DOWNLOAD_COUNT} downloads used
        </p>
      </div>

      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        value={selectedFormats}
        onValueChange={onValueChange}
        className="flex flex-wrap gap-2"
        disabled={isDownloading}
      >
        {availableFormats.map(({ formatType }) => (
          <ToggleGroupItem
            key={formatType}
            value={formatType}
            aria-label={`Select ${getFormatLabel(formatType)}`}
            className="px-3"
          >
            {getFormatLabel(formatType)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {formatProgress.length > 0 && <FormatProgressList progress={formatProgress} />}

      {downloadPhase === 'error' && downloadError && (
        <div className="text-destructive flex items-center gap-2 text-sm" role="alert">
          <AlertCircle className="size-4 shrink-0" />
          <span>{downloadError}</span>
        </div>
      )}

      {downloadPhase === 'complete' ? (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-emerald-600">
          <CheckCircle2 className="size-4" />
          Downloads started!
        </div>
      ) : (
        <Button
          className="w-full"
          type="button"
          disabled={!hasSelection || isDownloading}
          onClick={onDownload}
        >
          {isDownloading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Preparing...
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
      )}
    </div>
  );
};

interface CollectionDownloadDialogProps {
  releaseId: string;
  releaseTitle: string;
  availableFormats: AvailableFormat[];
  downloadCount: number;
  resetInHours: number | null;
}

const CollectionDownloadDialog = ({
  releaseId,
  releaseTitle,
  availableFormats,
  downloadCount,
  resetInHours,
}: CollectionDownloadDialogProps) => {
  const allFormatTypes = useMemo(
    () => availableFormats.map((f) => f.formatType),
    [availableFormats]
  );
  const [selectedFormats, setSelectedFormats] = useState<string[]>(allFormatTypes);
  const [open, setOpen] = useState(false);

  const {
    downloadPhase,
    formatProgress,
    downloadError,
    isDownloading,
    handleDownload,
    resetDownloadState,
  } = useCollectionDownload(releaseId);

  const atLimit = downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT;
  const noFormats = availableFormats.length === 0;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isDownloading) return;
      setOpen(nextOpen);
      if (nextOpen) {
        setSelectedFormats(allFormatTypes);
        resetDownloadState();
      }
    },
    [allFormatTypes, isDownloading, resetDownloadState]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label={`Download ${releaseTitle}`}>
          <DownloadIcon className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          if (isDownloading) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isDownloading) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Download</DialogTitle>
          <DialogDescription>
            Select formats for <strong>{releaseTitle}</strong>
          </DialogDescription>
        </DialogHeader>

        {atLimit ? (
          <>
            <Button className="w-full" type="button" disabled>
              <DownloadIcon className="size-4" />
              Download limit reached
            </Button>
            <p className="text-sm text-zinc-950">
              You&apos;ve reached your download limit for <strong>{releaseTitle}</strong>.
              {resetInHours !== null
                ? ` Resets in ${resetInHours} hour${resetInHours === 1 ? '' : 's'}.`
                : ''}
            </p>
          </>
        ) : noFormats ? (
          <p className="text-sm text-zinc-950">
            No digital formats are available for download yet.
          </p>
        ) : (
          <DownloadFormatForm
            availableFormats={availableFormats}
            downloadCount={downloadCount}
            selectedFormats={selectedFormats}
            onValueChange={setSelectedFormats}
            isDownloading={isDownloading}
            formatProgress={formatProgress}
            downloadPhase={downloadPhase}
            downloadError={downloadError}
            onDownload={() => handleDownload(selectedFormats)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
