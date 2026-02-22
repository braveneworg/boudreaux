/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ReleaseCard component for the public releases listing page.
 * Displays a release's cover art (with fallback), artist name, title,
 * Bandcamp link (if available), and a "Play" button linking to the
 * in-app media player at `/releases/{releaseId}`.
 */
import Image from 'next/image';
import Link from 'next/link';

import { Music2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface ReleaseCardProps {
  /** Unique release identifier */
  id: string;
  /** Release title */
  title: string;
  /** Resolved artist display name */
  artistName: string;
  /** Cover art source and alt text, or null for styled placeholder */
  coverArt: { src: string; alt: string } | null;
  /** Bandcamp URL for external purchase link, or null */
  bandcampUrl: string | null;
}

/**
 * A card displaying a single release with cover art, artist name, title,
 * and action links (Bandcamp + in-app player).
 */
export const ReleaseCard = ({ id, title, artistName, coverArt, bandcampUrl }: ReleaseCardProps) => {
  return (
    <article className="group flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      {/* Cover Art */}
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-zinc-100">
        {coverArt ? (
          <Image
            src={coverArt.src}
            alt={coverArt.alt}
            fill
            loading="lazy"
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div
            data-testid="cover-art-placeholder"
            className={cn(
              'flex h-full w-full flex-col items-center justify-center',
              'bg-zinc-800 text-white text-center p-4'
            )}
          >
            <span className="text-sm font-medium">{title}</span>
            <span className="text-xs text-zinc-400">{artistName}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-zinc-900 line-clamp-1">{title}</h3>
        <p className="text-xs text-zinc-500 line-clamp-1">{artistName}</p>
      </div>

      {/* Actions */}
      <div className="mt-auto flex items-center gap-2">
        <Link
          href={`/releases/${id}?autoplay=true`}
          aria-label={`Play ${title}`}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium',
            'bg-zinc-900 text-white hover:bg-zinc-700 transition-colors'
          )}
        >
          <Music2 className="size-3.5" />
          Play
        </Link>

        {bandcampUrl ? (
          <Link
            href={bandcampUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            Bandcamp
          </Link>
        ) : null}
      </div>
    </article>
  );
};
