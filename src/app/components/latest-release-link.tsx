/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';
import type { JSX, MouseEvent } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useHydrated } from '@/hooks/use-hydrated';
import { useReleasePlayDialog } from '@/hooks/use-release-play-dialog';
import { cn } from '@/lib/utils';

import { ReleasePlayDialog } from './release-play-dialog';

/** The newest release the page leads with, as the page derives it from the artist graph. */
export interface LatestRelease {
  id: string;
  title: string;
  releasedOn: Date;
  /** The first MP3 track's stream URL, or `null` when nothing is playable. */
  playSrc: string | null;
  /** The album artist's name when this artist is only featured on it (ADR-0015). */
  byName: string | null;
}

interface LatestReleaseLinkProps {
  release: LatestRelease;
  artistName: string;
  slug: string;
  className?: string;
}

/** A plain left click, with no modifier: the one the page may intercept. */
const isPlainLeftClick = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * The latest-release line: a link to the release page that, when the
 * release is playable, primes track 1 inside the click and opens the
 * listening modal instead (the `/releases` Play flow). Modified clicks, the
 * keyboard's open-in-new-tab and an unplayable release all navigate as a
 * link does; the `aria-haspopup` appears once hydrated, so the server
 * markup is the plain link. The modal's footer and the line beneath both
 * reach every release; the footer closes the modal first.
 */
export const LatestReleaseLink = ({
  release,
  artistName,
  slug,
  className,
}: LatestReleaseLinkProps): JSX.Element => {
  const router = useRouter();
  const hydrated = useHydrated();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const {
    playerOpen,
    prefetchPlayer,
    openPlayer,
    handlePlayerOpenChange,
    warmPlayer,
    takeMediaEl,
  } = useReleasePlayDialog(release.playSrc);
  const playable = release.playSrc !== null;
  const allReleasesHref = `/artists/${slug}/releases`;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!playable || !isPlainLeftClick(event)) return;
    event.preventDefault();
    openPlayer();
  };

  const viewAllReleases = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    handlePlayerOpenChange(false);
    router.push(allReleasesHref);
  };

  const returnFocusToLink = (event: Event): void => {
    event.preventDefault();
    linkRef.current?.focus();
  };

  return (
    <div className={cn('space-y-1', className)}>
      <p>
        <Link
          ref={linkRef}
          href={`/releases/${release.id}`}
          prefetch={false}
          onClick={handleClick}
          onPointerEnter={playable ? warmPlayer : undefined}
          onFocus={playable ? warmPlayer : undefined}
          aria-haspopup={hydrated && playable ? 'dialog' : undefined}
          className="underline underline-offset-4 hover:no-underline"
        >
          {release.title}
        </Link>
        {release.byName ? <> by {release.byName}</> : null} ({release.releasedOn.getUTCFullYear()})
      </p>
      <p className="text-sm">
        <Link href={allReleasesHref} className="underline underline-offset-2 hover:no-underline">
          All releases
        </Link>
      </p>
      {playable ? (
        <ReleasePlayDialog
          releaseId={release.id}
          title={release.title}
          artistName={release.byName ?? artistName}
          open={playerOpen}
          onOpenChange={handlePlayerOpenChange}
          takeMediaEl={takeMediaEl}
          prefetch={prefetchPlayer}
          onCloseAutoFocus={returnFocusToLink}
          footer={
            <Link
              href={allReleasesHref}
              onClick={viewAllReleases}
              className="underline underline-offset-4 hover:no-underline"
            >
              View all releases
            </Link>
          }
        />
      ) : null}
    </div>
  );
};
