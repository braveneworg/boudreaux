/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { CheckCircle2, DownloadIcon, Loader2, Trash2 } from 'lucide-react';

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
import { useBundleDownloadMutation } from '@/app/hooks/use-bundle-download-mutation';
import { deletePurchaseAction } from '@/lib/actions/collection-actions';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { FORMAT_LABELS } from '@/lib/constants/digital-formats';
import { getReleaseCoverArt } from '@/lib/utils/release-helpers';

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
      {purchases.map((purchase) => {
        const artistName = getArtistName(purchase);
        const coverArt = getReleaseCoverArt(purchase.release);
        const downloadCount = purchase.release.releaseDownloads[0]?.downloadCount ?? 0;
        const availableFormats = purchase.release.digitalFormats
          .filter((f) => f.files.length > 0)
          .map((f) => ({
            formatType: f.formatType,
            fileName: f.files[0]?.fileName ?? '',
          }));

        return (
          <div
            key={purchase.id}
            className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
          >
            {/* Cover Art */}
            <Link href={`/releases/${purchase.release.id}`} className="shrink-0">
              {coverArt ? (
                <Image
                  src={coverArt.src}
                  alt={coverArt.alt}
                  width={80}
                  height={80}
                  className="rounded-md object-cover size-20"
                />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-md bg-zinc-200 text-zinc-400 text-xs">
                  No art
                </div>
              )}
            </Link>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <Link
                href={`/releases/${purchase.release.id}`}
                className="block truncate font-semibold text-zinc-900 hover:underline"
              >
                {purchase.release.title}
              </Link>
              <p className="truncate text-sm text-zinc-500">{artistName}</p>
              <p className="text-xs text-zinc-400 mt-1">
                {formatPrice(purchase.amountPaid, purchase.currency)}
                {' \u00b7 '}
                {new Date(purchase.purchasedAt).toLocaleDateString()}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <CollectionDownloadDialog
                releaseId={purchase.release.id}
                releaseTitle={purchase.release.title}
                availableFormats={availableFormats}
                downloadCount={downloadCount}
              />

              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="icon"
                      disabled={deletingId === purchase.id}
                      aria-label={`Delete purchase for ${purchase.release.title}`}
                    >
                      {deletingId === purchase.id ? (
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
                      <AlertDialogAction onClick={() => handleDelete(purchase.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Download Dialog ────────────────────────────────────────────────────────

interface AvailableFormat {
  formatType: string;
  fileName: string;
}

interface CollectionDownloadDialogProps {
  releaseId: string;
  releaseTitle: string;
  availableFormats: AvailableFormat[];
  downloadCount: number;
}

const CollectionDownloadDialog = ({
  releaseId,
  releaseTitle,
  availableFormats,
  downloadCount,
}: CollectionDownloadDialogProps) => {
  const allFormatTypes = availableFormats.map((f) => f.formatType);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(allFormatTypes);
  const [open, setOpen] = useState(false);

  const download = useBundleDownloadMutation();

  const atLimit = downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT;
  const hasSelection = selectedFormats.length > 0;
  const noFormats = availableFormats.length === 0;

  const handleDownload = () => {
    if (!hasSelection || atLimit) return;
    download.mutate({ releaseId, formats: selectedFormats });
  };

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        setSelectedFormats(allFormatTypes);
        download.reset();
      }
    },
    [allFormatTypes, download]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label={`Download ${releaseTitle}`}>
          <DownloadIcon className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
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
            <p className="text-muted-foreground text-sm">
              You&apos;ve reached the {MAX_RELEASE_DOWNLOAD_COUNT}-download limit. Contact{' '}
              <a href="mailto:support@fakefourinc.com" className="underline">
                support@fakefourinc.com
              </a>{' '}
              for assistance.
            </p>
          </>
        ) : noFormats ? (
          <p className="text-muted-foreground text-sm">
            No digital formats are available for download yet.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Select formats:</p>
              <p className="text-muted-foreground text-xs">
                {downloadCount}/{MAX_RELEASE_DOWNLOAD_COUNT} downloads used
              </p>
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
                >
                  {FORMAT_LABELS[formatType] ?? formatType}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            {download.error && (
              <p className="text-destructive text-sm" role="alert">
                {download.error.message}
              </p>
            )}

            {download.isSuccess && !download.isPending && (
              <div className="flex items-center justify-center gap-2 py-2" role="status">
                <CheckCircle2 className="text-green-600 size-5" />
                <span className="text-sm font-medium">Download complete</span>
              </div>
            )}

            <Button
              className="w-full"
              type="button"
              disabled={!hasSelection || download.isPending}
              onClick={handleDownload}
            >
              {download.isPending ? (
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
        )}
      </DialogContent>
    </Dialog>
  );
};
