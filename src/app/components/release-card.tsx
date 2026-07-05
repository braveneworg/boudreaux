/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ReleaseCard component for the public releases listing page.
 * Displays a release's cover art (click to enlarge with details), artist name,
 * title, Bandcamp link (if available), and a "Play" button linking to the
 * in-app media player at `/releases/{releaseId}`.
 */
import Link from 'next/link';

import { Music2 } from 'lucide-react';

import { cn } from '@/lib/utils';

import { DeferredDownloadDialog } from './deferred-download-dialog';
import { ReleaseCoverModal } from './release-cover-modal';

interface ReleaseCardProps {
  /** Unique release identifier */
  id: string;
  /** Release title */
  title: string;
  /** Resolved artist display name, or null if unresolvable */
  artistName: string | null;
  /** Cover art source and alt text, or null for styled placeholder */
  coverArt: { src: string; alt: string } | null;
  /** Release date, shown in the cover preview dialog */
  releasedOn: Date;
  /** Bandcamp URL for external purchase link, or null */
  bandcampUrl: string | null;
}

/**
 * A card displaying a single release with cover art, artist name, title,
 * and action links (Bandcamp + in-app player). On desktop the whole card
 * scales up slightly on hover.
 */
export const ReleaseCard = ({
  id,
  title,
  artistName,
  coverArt,
  releasedOn,
  bandcampUrl,
}: ReleaseCardProps) => {
  return (
    <div className="shadow-zine-sm relative flex flex-col gap-2 border-2 border-black bg-white p-3 transition-transform duration-200 md:hover:z-10 md:hover:scale-[1.03]">
      {/* Cover Art — click to enlarge with release info + detail link */}
      <ReleaseCoverModal
        id={id}
        title={title}
        artistName={artistName}
        coverArt={coverArt}
        releasedOn={releasedOn}
      />

      {/* Info */}
      <div className="flex flex-col gap-0.5">
        <h3 className="line-clamp-1 text-sm font-semibold text-zinc-900">{title}</h3>
        {artistName && <p className="line-clamp-1 text-xs text-zinc-500">{artistName}</p>}
      </div>

      {/* Actions */}
      <div className="mt-auto flex items-center gap-2">
        <Link
          href={`/releases/${id}?autoplay=true`}
          aria-label={`Play ${title}`}
          className={cn(
            'inline-flex items-center gap-1 border-2 border-black px-3 py-1.5 text-xs font-medium',
            'shadow-zine-ink bg-zinc-900 text-white transition-colors hover:bg-zinc-700'
          )}
        >
          <Music2 className="size-3.5" />
          Play
        </Link>

        <DeferredDownloadDialog
          artistName={artistName ?? ''}
          releaseId={id}
          releaseTitle={title}
          triggerClassName={cn(
            'mb-0 min-h-0 gap-1 border-2 border-black shadow-zine-ink px-3 py-1.5 text-xs font-medium opacity-100',
            'bg-zinc-900 text-white hover:bg-zinc-700 hover:opacity-100 transition-colors'
          )}
        />

        {bandcampUrl ? (
          <Link
            href={bandcampUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shadow-zine-ink inline-flex items-center border-2 border-black bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-900"
          >
            Bandcamp
          </Link>
        ) : null}
      </div>
    </div>
  );
};
