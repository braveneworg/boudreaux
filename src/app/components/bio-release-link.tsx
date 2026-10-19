/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX, MouseEvent, ReactNode } from 'react';

import Link from 'next/link';

import { useReleaseQuery } from '@/hooks/queries/use-release-query';
import { useHydrated } from '@/hooks/use-hydrated';
import { useListeningModal } from '@/hooks/use-listening-modal';
import { isPlainLeftClick } from '@/lib/utils/is-plain-left-click';
import { getArtistDisplayNameForRelease } from '@/lib/utils/release-helpers';

interface BioReleaseLinkProps {
  /** The stored release deep link, as the bio HTML carries it. */
  href: string;
  artistSlug: string;
  releaseId: string;
  children: ReactNode;
}

/**
 * A release deep link in an artist's biography: the server markup is the
 * plain `<a href>`, and once hydrated a plain left click opens the release's
 * listening modal in place, while modified clicks follow the href. The link
 * knows no stream URL until the release is fetched (on hover, focus or open),
 * so the modal opens unprimed and relies on the player's deferred `play()`.
 * Chrome lets that start, since the click left sticky user activation;
 * Safari may open it paused, and the visitor presses play.
 */
export const BioReleaseLink = ({
  href,
  artistSlug,
  releaseId,
  children,
}: BioReleaseLinkProps): JSX.Element => {
  const hydrated = useHydrated();
  // The modal fetches the release once warmed or opened; the heading reads
  // the same cached result.
  const { data: release } = useReleaseQuery(releaseId, { enabled: false });
  const artistName = release?.albumArtist
    ? getArtistDisplayNameForRelease(release.albumArtist)
    : null;
  const listening = useListeningModal({
    release: { id: releaseId, title: release?.title ?? '', artistName, artistSlug, playSrc: null },
  });

  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    listening.open();
  };

  return (
    <>
      <Link
        href={href}
        prefetch={false}
        onClick={handleClick}
        onPointerEnter={listening.warm}
        onFocus={listening.warm}
        aria-haspopup={hydrated ? 'dialog' : undefined}
      >
        {children}
      </Link>
      {listening.modal}
    </>
  );
};
