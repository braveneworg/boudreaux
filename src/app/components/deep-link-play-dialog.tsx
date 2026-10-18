/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { MouseEvent, ReactElement } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useListeningModal } from '@/hooks/use-listening-modal';
import { artistReleasesHref } from '@/lib/utils/artist-releases-href';
import { isPlainLeftClick } from '@/lib/utils/is-plain-left-click';

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
}: DeepLinkPlayDialogProps): ReactElement | null => {
  const router = useRouter();
  const allReleasesHref = artistReleasesHref(artistSlug);

  // A plain click closes onto the listing; a modified click (a new tab) is the
  // browser's and leaves the modal here.
  const viewAllReleases = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    listening.close();
  };

  const listening = useListeningModal({
    release: {
      id: release.id,
      title: release.title,
      artistName: release.artistName,
      artistSlug,
      playSrc: release.playSrc,
    },
    openOnArrival: true,
    onClose: () => router.replace(allReleasesHref, { scroll: false }),
    layout: 'sheet',
    year: release.year,
    footer: (
      <p className="text-center">
        <Link href={allReleasesHref} onClick={viewAllReleases} className={FOOTER_LINK_CLASS}>
          View all releases
        </Link>
      </p>
    ),
  });

  return listening.modal;
};
