/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';
import type { JSX, MouseEvent } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { zineAccentForRelease } from '@/app/components/ui/zine-panel';
import { useHydrated } from '@/hooks/use-hydrated';
import { useReleasePlayDialog } from '@/hooks/use-release-play-dialog';
import { cn } from '@/lib/utils';
import { artistReleasesHref } from '@/lib/utils/artist-releases-href';
import { isPlainLeftClick } from '@/lib/utils/is-plain-left-click';
import { releaseDeepLinkHref, releaseDeepLinkUrl } from '@/lib/utils/release-deep-link';

import { AllReleasesLink } from './all-releases-link';
import { ReleasePlayDialog } from './release-play-dialog';
import { ReleaseShareWidget } from './release-share-widget';

/** An artist's newest release, as the artist page and the artists index card lead with it. */
export interface LatestRelease {
  id: string;
  title: string;
  releasedOn: Date;
  /** The first MP3 track's stream URL, or `null` when nothing is playable. */
  playSrc: string | null;
  /** The album artist's name when this artist is only featured on it (ADR-0015). */
  byName: string | null;
  /** The album artist's slug, or `null` when that artist is hidden (ADR-0015). */
  albumArtistSlug: string | null;
}

interface LatestReleasePlayLinkProps {
  release: LatestRelease;
  /** The artist whose page or card this is: the modal's byline unless featured. */
  artistName: string;
  /** That artist's slug: "View all releases" lists their releases. */
  slug: string;
  /**
   * `'page'`: the artist page's "Latest Release:" line with "View all
   * releases" beneath it. `'card'`: the artists index card's inline
   * "Latest: title (year)", inside the card's own line.
   */
  variant: 'page' | 'card';
  className?: string;
}

const PAGE_LINK_CLASS = 'underline underline-offset-4 hover:no-underline';
const CARD_LINK_CLASS = 'underline underline-offset-2 hover:no-underline';

/**
 * An artist's latest release, the title opening its listening modal in place
 * (the `/releases` Play flow): a plain left click primes track 1 inside the
 * gesture and opens the modal; modified clicks and the keyboard's
 * open-in-new-tab follow the href, the release deep link. The link and its
 * `aria-haspopup` appear once hydrated: the server markup is a link-styled
 * button with no href, so a click before the JavaScript runs never leaves
 * the page for the deep link, where the modal would open paused. A release
 * with nothing playable shows its title as plain text. The modal takes the
 * release's own accent, shares the deep link, and its "View all releases"
 * footer closes it before listing the artist's releases.
 *
 * The deep link names the album artist's releases, or this artist's when the
 * album artist is hidden.
 */
export const LatestReleasePlayLink = ({
  release,
  artistName,
  slug,
  variant,
  className,
}: LatestReleasePlayLinkProps): JSX.Element => {
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
  const allReleasesHref = artistReleasesHref(slug);
  const deepLinkSlug = release.albumArtistSlug ?? slug;
  const year = release.releasedOn.getUTCFullYear();

  const handleClick = (event: MouseEvent<HTMLElement>): void => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    openPlayer();
  };

  // A plain click closes the modal first, then navigates; a modified click
  // (a new tab) is the browser's and leaves the music playing here.
  const viewAllReleases = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    handlePlayerOpenChange(false);
    router.push(allReleasesHref);
  };

  const returnFocusToLink = (event: Event): void => {
    event.preventDefault();
    linkRef.current?.focus();
  };

  const linkClass = variant === 'card' ? CARD_LINK_CLASS : PAGE_LINK_CLASS;

  const title =
    release.playSrc === null ? (
      <span>{release.title}</span>
    ) : (
      <>
        {hydrated ? (
          <Link
            ref={linkRef}
            href={releaseDeepLinkHref(deepLinkSlug, release.id)}
            prefetch={false}
            onClick={handleClick}
            onPointerEnter={warmPlayer}
            onFocus={warmPlayer}
            aria-haspopup="dialog"
            className={linkClass}
          >
            {release.title}
          </Link>
        ) : (
          // No href until hydrated: a click before the JavaScript runs stays
          // on the page, and one during hydration is replayed to handleClick.
          // A button, as jsx-a11y asks of a link-styled control with no href.
          // A button box cannot wrap inside the line, so it draws none: its
          // text is an inline span that wraps and looks like the link.
          <button type="button" onClick={handleClick} className="contents">
            <span className={cn('cursor-pointer', linkClass)}>{release.title}</span>
          </button>
        )}
        <ReleasePlayDialog
          releaseId={release.id}
          title={release.title}
          artistName={release.byName ?? artistName}
          open={playerOpen}
          onOpenChange={handlePlayerOpenChange}
          takeMediaEl={takeMediaEl}
          prefetch={prefetchPlayer}
          onCloseAutoFocus={returnFocusToLink}
          accent={zineAccentForRelease(release.id)}
          shareWidget={
            <ReleaseShareWidget
              artistSlug={deepLinkSlug}
              artistName={release.byName ?? artistName}
              releaseTitle={release.title}
              shareUrl={releaseDeepLinkUrl(deepLinkSlug, release.id)}
            />
          }
          footer={
            <Link href={allReleasesHref} onClick={viewAllReleases} className={PAGE_LINK_CLASS}>
              View all releases
            </Link>
          }
        />
      </>
    );

  if (variant === 'card') {
    return (
      <>
        Latest: {title} ({year})
      </>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <p>
        <span className="font-semibold">Latest Release:</span> {title}
        {release.byName ? <> by {release.byName}</> : null} ({year})
      </p>
      <p className="text-sm">
        <AllReleasesLink slug={slug} />
      </p>
    </div>
  );
};
