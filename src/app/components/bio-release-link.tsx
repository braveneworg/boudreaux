/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { JSX, MouseEvent, ReactNode } from 'react';

import Link from 'next/link';

import { zineAccentForRelease } from '@/app/components/ui/zine-panel';
import { useReleaseQuery } from '@/hooks/queries/use-release-query';
import { useHydrated } from '@/hooks/use-hydrated';
import { useReleasePlayDialog } from '@/hooks/use-release-play-dialog';
import { isPlainLeftClick } from '@/lib/utils/is-plain-left-click';
import { releaseDeepLinkUrl } from '@/lib/utils/release-deep-link';
import { getArtistDisplayNameForRelease } from '@/lib/utils/release-helpers';

import { ReleasePlayDialog } from './release-play-dialog';
import { ReleaseShareWidget } from './release-share-widget';

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
  const [hovered, setHovered] = useState(false);
  const { playerOpen, handlePlayerOpenChange, takeMediaEl } = useReleasePlayDialog(null);
  const { data: release } = useReleaseQuery(releaseId, { enabled: hovered || playerOpen });
  const artistName = release?.albumArtist
    ? getArtistDisplayNameForRelease(release.albumArtist)
    : null;
  const title = release?.title ?? '';

  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    handlePlayerOpenChange(true);
  };

  const warm = (): void => setHovered(true);

  return (
    <>
      <Link
        href={href}
        prefetch={false}
        onClick={handleClick}
        onPointerEnter={warm}
        onFocus={warm}
        aria-haspopup={hydrated ? 'dialog' : undefined}
      >
        {children}
      </Link>
      <ReleasePlayDialog
        releaseId={releaseId}
        title={title}
        artistName={artistName}
        open={playerOpen}
        onOpenChange={handlePlayerOpenChange}
        takeMediaEl={takeMediaEl}
        accent={zineAccentForRelease(releaseId)}
        shareWidget={
          <ReleaseShareWidget
            artistSlug={artistSlug}
            artistName={artistName}
            releaseTitle={title}
            shareUrl={releaseDeepLinkUrl(artistSlug, releaseId)}
          />
        }
      />
    </>
  );
};
