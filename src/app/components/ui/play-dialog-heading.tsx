/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement, ReactNode } from 'react';

import Link from 'next/link';

import { cn } from '@/lib/utils';

import { DialogDescription, DialogHeader, DialogTitle } from './dialog';

export interface PlayDialogHeadingProps {
  title: string;
  /** The artist to name; only a release can lack one. */
  artistName: string | null;
  /** The artist's page: the artist line links there when given. */
  artistHref?: string;
  /** Shown after the title as `Title (Year)` when given. */
  year?: number;
  /**
   * Which line names the dialog. `'title-first'` titles it with the title and
   * describes it with the artist; `'artist-first'` swaps the two, and falls
   * back to the title when there is no artist to name.
   */
  headingOrder: 'title-first' | 'artist-first';
  /** Center both lines. */
  centered: boolean;
  /** Set both lines smaller below `sm`, for a phone sheet. */
  compactOnPhone: boolean;
  /** Rendered at the heading's right, left of the dialog's close button. */
  action?: ReactNode;
}

/** The artist's name, a link to their page when an href is given. */
const ArtistLine = ({
  artistName,
  artistHref,
}: {
  artistName: string;
  artistHref?: string;
}): ReactElement =>
  artistHref ? (
    <Link href={artistHref} className="no-underline underline-offset-4 hover:underline">
      {artistName}
    </Link>
  ) : (
    <>{artistName}</>
  );

type PlayDialogLinesProps = Omit<PlayDialogHeadingProps, 'action'>;

/** The two lines' classes: centered, and smaller on a phone when compact. */
const lineClasses = (
  centered: boolean,
  compactOnPhone: boolean
): { title: string; description: string } => ({
  title: cn(
    'font-fake-four-cutout text-xl font-normal break-words text-zinc-950 sm:text-2xl',
    centered && 'text-center',
    compactOnPhone && 'max-sm:text-lg max-sm:leading-tight'
  ),
  description: cn('text-zinc-600', centered && 'text-center', compactOnPhone && 'max-sm:text-xs'),
});

/**
 * The first line, in the cutout face, names the dialog; the second, in zinc
 * Jost, describes it. Artist-first needs an artist; without one the title
 * leads.
 */
const PlayDialogLines = ({
  title,
  artistName,
  artistHref,
  year,
  headingOrder,
  centered,
  compactOnPhone,
}: PlayDialogLinesProps): ReactElement => {
  const artistFirst = headingOrder === 'artist-first' && artistName !== null;
  const titleLine = year === undefined ? title : `${title} (${year})`;
  const artistLine =
    artistName === null ? null : <ArtistLine artistName={artistName} artistHref={artistHref} />;
  const classes = lineClasses(centered, compactOnPhone);

  return (
    <>
      <DialogTitle className={classes.title}>{artistFirst ? artistLine : titleLine}</DialogTitle>
      <DialogDescription className={classes.description}>
        {artistFirst ? titleLine : (artistLine ?? 'Release audio player')}
      </DialogDescription>
    </>
  );
};

/**
 * The two heading lines of a play modal ({@link PlayDialogLines}). The artist
 * line links to the artist's page when `artistHref` is given, underlined on
 * hover only, and the title line carries the year when `year` is given. An
 * `action` (the add-to-playlist kebab) sits at the heading's right.
 */
export const PlayDialogHeading = ({ action, ...lines }: PlayDialogHeadingProps): ReactElement =>
  action ? (
    <DialogHeader className="flex-row items-start gap-2 pr-8">
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col gap-2',
          lines.compactOnPhone && 'max-sm:gap-0.5'
        )}
      >
        <PlayDialogLines {...lines} />
      </div>
      <div className="shrink-0">{action}</div>
    </DialogHeader>
  ) : (
    <DialogHeader className={cn('pr-8', lines.compactOnPhone && 'max-sm:gap-0.5')}>
      <PlayDialogLines {...lines} />
    </DialogHeader>
  );
