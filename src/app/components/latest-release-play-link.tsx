/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';
import type { JSX, MouseEvent } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useHydrated } from '@/hooks/use-hydrated';
import { useListeningModal, type ListeningModalRelease } from '@/hooks/use-listening-modal';
import type { LatestRelease } from '@/lib/types/domain/artist';
import { cn } from '@/lib/utils';
import { artistReleasesHref } from '@/lib/utils/artist-releases-href';
import { isPlainLeftClick } from '@/lib/utils/is-plain-left-click';
import { releaseDeepLinkHref } from '@/lib/utils/release-deep-link';

import { AllReleasesLink } from './all-releases-link';

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
 * The release as its listening modal opens it: bylined by the album artist
 * when this artist is only featured, its deep link on `deepLinkSlug`. `null`
 * when nothing is playable.
 */
const toListeningRelease = (
  { id, title, playSrc, byName }: LatestRelease,
  artistName: string,
  deepLinkSlug: string
): ListeningModalRelease | null =>
  playSrc === null
    ? null
    : { id, title, artistName: byName ?? artistName, artistSlug: deepLinkSlug, playSrc };

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
  const allReleasesHref = artistReleasesHref(slug);
  const deepLinkSlug = release.albumArtistSlug ?? slug;
  const year = release.releasedOn.getUTCFullYear();

  // A plain click closes the modal first, then navigates; a modified click
  // (a new tab) is the browser's and leaves the music playing here.
  const viewAllReleases = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    listening.close();
    router.push(allReleasesHref);
  };

  const returnFocusToLink = (event: Event): void => {
    event.preventDefault();
    linkRef.current?.focus();
  };

  const listening = useListeningModal({
    release: toListeningRelease(release, artistName, deepLinkSlug),
    onCloseAutoFocus: returnFocusToLink,
    footer: (
      <Link href={allReleasesHref} onClick={viewAllReleases} className={PAGE_LINK_CLASS}>
        View all releases
      </Link>
    ),
  });

  const handleClick = (event: MouseEvent<HTMLElement>): void => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    listening.open();
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
            onPointerEnter={listening.warm}
            onFocus={listening.warm}
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
        {listening.modal}
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
