/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { Expand } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatTourDate } from '@/lib/utils/date-utils';

interface ReleaseCoverModalProps {
  /** Unique release identifier, used for the detail-page link */
  id: string;
  /** Release title */
  title: string;
  /** Resolved artist display name, or null if unresolvable */
  artistName: string | null;
  /** Cover art source and alt text, or null for a styled placeholder */
  coverArt: { src: string; alt: string } | null;
  /** Release date, formatted for display in the dialog */
  releasedOn: Date;
}

/** Shared image sizing for the square cover thumbnail across the grid breakpoints. */
const COVER_SIZES =
  '(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw';

/**
 * The clickable cover art for a release card. When cover art exists, the image
 * acts as a zoom trigger that opens a dialog showing an enlarged cover, the
 * release title/artist/date, and a link through to the full detail page. When
 * there is no cover art, a non-interactive styled placeholder is shown instead
 * (there is nothing to enlarge).
 */
export const ReleaseCoverModal = ({
  id,
  title,
  artistName,
  coverArt,
  releasedOn,
}: ReleaseCoverModalProps): ReactElement => {
  if (!coverArt) {
    return (
      <div className="relative aspect-square w-full overflow-hidden border-2 border-black bg-zinc-100">
        <div
          data-testid="cover-art-placeholder"
          className={cn(
            'flex h-full w-full flex-col items-center justify-center',
            'bg-zinc-800 p-4 text-center text-white'
          )}
        >
          <span className="text-sm font-medium">{title}</span>
          {artistName && <span className="text-xs text-zinc-400">{artistName}</span>}
        </div>
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Expand cover art for ${title}`}
          className={cn(
            'group relative block aspect-square w-full cursor-zoom-in overflow-hidden border-2 border-black bg-zinc-100',
            'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none'
          )}
        >
          <Image
            src={coverArt.src}
            alt={coverArt.alt}
            fill
            loading="lazy"
            className="object-cover"
            sizes={COVER_SIZES}
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
            <Expand
              className="size-6 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogTitle className="font-fake-four-cutout text-2xl tracking-wide text-black uppercase">
          {title}
        </DialogTitle>
        <DialogDescription className="text-zinc-600">
          {artistName && <span className="block font-medium text-zinc-900">{artistName}</span>}
          <span className="block text-sm">Released {formatTourDate(releasedOn)}</span>
        </DialogDescription>

        <div className="relative aspect-square w-full overflow-hidden border-2 border-black bg-zinc-100">
          <Image
            src={coverArt.src}
            alt={coverArt.alt}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 512px"
          />
        </div>

        <Link
          href={`/releases/${id}`}
          className={cn(
            'shadow-zine-ink inline-flex items-center justify-center border-2 border-black px-4 py-2',
            'bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700'
          )}
        >
          View release details
        </Link>
      </DialogContent>
    </Dialog>
  );
};
