/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { MouseEvent, ReactElement } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { zineAccentForRelease } from '@/app/components/ui/zine-panel';
import { artistReleasesHref } from '@/lib/utils/artist-releases-href';
import { isPlainLeftClick } from '@/lib/utils/is-plain-left-click';
import { releaseDeepLinkUrl } from '@/lib/utils/release-deep-link';

import { ReleasePlayDialog } from './release-play-dialog';
import { ReleaseShareWidget } from './release-share-widget';

/** The release a deep link opens, as the `/releases` page resolved it. */
export interface DeepLinkRelease {
  id: string;
  title: string;
  /** The album artist's name; `null` when that artist is hidden (ADR-0015). */
  artistName: string | null;
  /** The first MP3 track's stream URL: a deep-linked release is always playable. */
  playSrc: string;
  year: number;
}

interface DeepLinkPlayDialogProps {
  release: DeepLinkRelease;
  /** The `?artist=` filter's slug: the deep link's listing. */
  artistSlug: string;
}

const FOOTER_LINK_CLASS = 'underline underline-offset-4 hover:no-underline';

/**
 * The listening modal a release deep link (`/releases?artist=<slug>&release=<id>`)
 * opens on arrival, over the filtered grid, on track 1. It opens unprimed and
 * paused: there was no gesture to start playback from, and browsers block
 * audio without one, so the visitor presses play. Framed in the release's own
 * accent, it shares the deep link and closes onto the artist's releases with
 * `router.replace`, so back and refresh do not reopen it.
 */
export const DeepLinkPlayDialog = ({
  release,
  artistSlug,
}: DeepLinkPlayDialogProps): ReactElement => {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const allReleasesHref = artistReleasesHref(artistSlug);

  const close = (): void => {
    setOpen(false);
    router.replace(allReleasesHref, { scroll: false });
  };

  const handleOpenChange = (next: boolean): void => {
    if (!next) close();
  };

  // A plain click closes onto the listing; a modified click (a new tab) is the
  // browser's and leaves the modal here.
  const viewAllReleases = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    close();
  };

  return (
    <ReleasePlayDialog
      releaseId={release.id}
      title={release.title}
      artistName={release.artistName}
      year={release.year}
      open={open}
      onOpenChange={handleOpenChange}
      takeMediaEl={() => null}
      autoPlay={false}
      accent={zineAccentForRelease(release.id)}
      headingOrder="artist-first"
      centered
      sheetOnPhone
      shareWidget={
        <ReleaseShareWidget
          artistSlug={artistSlug}
          artistName={release.artistName}
          releaseTitle={release.title}
          shareUrl={releaseDeepLinkUrl(artistSlug, release.id)}
        />
      }
      footer={
        <p className="text-center">
          <Link href={allReleasesHref} onClick={viewAllReleases} className={FOOTER_LINK_CLASS}>
            View all releases
          </Link>
        </p>
      }
    />
  );
};
