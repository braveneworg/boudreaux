/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactElement } from 'react';

import Image from 'next/image';

import type { Format } from '@/lib/types/domain/shared';
import { cn } from '@/lib/utils';
import { formatTourDate } from '@/lib/utils/date-utils';

interface ReleaseSummaryCardProps {
  /** Release title */
  title: string;
  /** Resolved artist display name, or null if unresolvable */
  artistName: string | null;
  /** Cover art source and alt text, or null for a styled placeholder */
  coverArt: { src: string; alt: string } | null;
  /** Release date, formatted for display */
  releasedOn: Date;
  /** Available formats, rendered as uppercase zine tags */
  formats: Format[];
  /** Extra classes from the parent (e.g. float utilities for the notes wrap) */
  className?: string;
}

/**
 * A compact, zine-styled summary of a release — cover, title, artist, release
 * date, and format tags. Presentational only; the detail page floats it so the
 * release notes wrap around it.
 */
export const ReleaseSummaryCard = ({
  title,
  artistName,
  coverArt,
  releasedOn,
  formats,
  className,
}: ReleaseSummaryCardProps): ReactElement => (
  <aside className={cn('shadow-zine-sm border-2 border-black bg-white p-3', className)}>
    <div className="relative aspect-square w-full overflow-hidden border-2 border-black bg-zinc-100">
      {coverArt ? (
        <Image
          src={coverArt.src}
          alt={coverArt.alt}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, 240px"
        />
      ) : (
        <div
          data-testid="summary-cover-placeholder"
          className={cn(
            'flex h-full w-full flex-col items-center justify-center',
            'bg-zinc-800 p-4 text-center text-white'
          )}
        >
          <span className="text-sm font-medium">{title}</span>
          {artistName && <span className="text-xs text-zinc-400">{artistName}</span>}
        </div>
      )}
    </div>

    <div className="mt-2 flex flex-col gap-1">
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      {artistName && <p className="text-xs text-zinc-500">{artistName}</p>}
      <p className="text-xs text-zinc-500">Released {formatTourDate(releasedOn)}</p>
      {formats.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1">
          {formats.map((format) => (
            <li
              key={format}
              className="border-2 border-black px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-black uppercase"
            >
              {format.replace(/_/g, ' ')}
            </li>
          ))}
        </ul>
      )}
    </div>
  </aside>
);
