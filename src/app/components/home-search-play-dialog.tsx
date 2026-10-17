/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useImperativeHandle, useState, type ReactElement, type Ref, type RefObject } from 'react';

import Link from 'next/link';

import {
  pickLoudZineAccent,
  zineAccentForRelease,
  type ZineAccent,
} from '@/app/components/ui/zine-panel';
import { VideoPlayDialog } from '@/components/ui/video/video-play-dialog';
import type {
  ArtistNavSearchRelease,
  ArtistNavSearchVideo,
} from '@/hooks/queries/use-artist-nav-search-query';
import { usePrimedAudioHandoff } from '@/hooks/use-primed-audio-handoff';
import { usePrimedMediaHandoff } from '@/hooks/use-primed-media-handoff';
import { artistReleasesHref } from '@/lib/utils/artist-releases-href';
import { artistVideosHref } from '@/lib/utils/artist-videos-href';
import { releaseDeepLinkUrl } from '@/lib/utils/release-deep-link';

import { AddToPlaylistMenu } from './playlists/add-to-playlist-menu';
import { videoMediaItem } from './playlists/player-media-item';
import { ReleasePlayDialog } from './release-play-dialog';
import { ReleaseShareWidget } from './release-share-widget';

/** The artist whose search group a picked row sat in: the modal's byline. */
export interface HomeSearchPickArtist {
  artistName: string;
  artistSlug: string;
}

/**
 * A picked release's album artist: the modal's byline, its links and the deep
 * link. Both `null` when the album artist is hidden (ADR-0015), as a
 * `/releases` search row's can be.
 */
export interface HomeSearchReleaseArtist {
  artistName: string | null;
  artistSlug: string | null;
}

/** What the search combobox calls, inside the pick's gesture. */
export interface HomeSearchPlayDialogHandle {
  /** Prime the release's first track and open it playing. */
  openRelease: (artist: HomeSearchReleaseArtist, release: ArtistNavSearchRelease) => void;
  /** Prime the video's stream and open it playing. */
  openVideo: (artist: HomeSearchPickArtist, video: ArtistNavSearchVideo) => void;
}

type HomeSearchSelection = { accent: ZineAccent } & (
  | (HomeSearchReleaseArtist & { kind: 'release'; item: ArtistNavSearchRelease })
  | (HomeSearchPickArtist & { kind: 'video'; item: ArtistNavSearchVideo })
);

interface HomeSearchPlayDialogProps {
  ref: Ref<HomeSearchPlayDialogHandle>;
  /** Where focus goes when the modal closes: the search trigger. */
  returnFocusRef: RefObject<HTMLElement | null>;
  /** Draws each video pick's accent; injectable for tests. */
  pickAccent?: () => ZineAccent;
}

const FOOTER_LINK_CLASS = 'underline underline-offset-4 hover:no-underline';

/** The sentence-case link under the player, as the spotlight caption sets its links. */
const ViewAllLink = ({ href, children }: { href: string; children: string }): ReactElement => (
  <p className="text-center">
    <Link href={href} className={FOOTER_LINK_CLASS}>
      {children}
    </Link>
  </p>
);

/**
 * The play modal behind the home and `/releases` searches: a picked release
 * plays in the release modal (a bottom sheet on phones), framed in the
 * release's own accent and sharing its deep link; a picked video plays in the
 * video modal, framed in a loud accent drawn per pick. Each has the artist as
 * a linked byline, the title with its year, and a "View all releases" or
 * "View all videos" link for that artist under the player (a release whose
 * album artist is hidden has no artist to link). The video modal carries the
 * add-to-playlist kebab, which shows only to a signed-in visitor.
 *
 * It owns the primed handoffs, so `openRelease` / `openVideo` start playback
 * inside the pick's gesture; the combobox imports it statically for that
 * reason. Closing stops an element the player never took, and once the closed
 * modal has gone the pick is discarded and focus returns to the search
 * trigger. Hiding the video modal for picture-in-picture is not a close.
 */
export const HomeSearchPlayDialog = ({
  ref,
  returnFocusRef,
  pickAccent = pickLoudZineAccent,
}: HomeSearchPlayDialogProps): ReactElement | null => {
  const [selection, setSelection] = useState<HomeSearchSelection | null>(null);
  const [open, setOpen] = useState(false);
  const audio = usePrimedAudioHandoff();
  const media = usePrimedMediaHandoff();

  useImperativeHandle(ref, () => ({
    openRelease: (artist, release) => {
      if (release.playSrc) audio.primeMediaEl(release.playSrc);
      setSelection({
        ...artist,
        kind: 'release',
        item: release,
        accent: zineAccentForRelease(release.id),
      });
      setOpen(true);
    },
    openVideo: (artist, video) => {
      if (video.streamUrl) media.primeMediaEl(video.streamUrl);
      setSelection({ ...artist, kind: 'video', item: video, accent: pickAccent() });
      setOpen(true);
    },
  }));

  if (!selection) return null;

  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      // Closed before the player took the element: stop it, or the
      // gesture-started playback goes on with no UI attached.
      audio.discardMediaEl();
      media.discardMediaEl();
    }
    setOpen(next);
  };

  /**
   * Once a closed modal has gone: forget the pick, focus the search trigger.
   * Radix fires this whenever the dialog's content unmounts, and the video
   * modal unmounts it to hide while its player is in picture-in-picture, still
   * open. Then the pick stays, or the player would be disposed and the modal
   * could never come back. (A picture-in-picture window closed paused closes
   * the modal while it is hidden; the closed pick then waits for the next.)
   */
  const handleCloseAutoFocus = (event: Event): void => {
    if (open) return;
    event.preventDefault();
    setSelection(null);
    returnFocusRef.current?.focus();
  };

  const { artistName, artistSlug, accent } = selection;
  const shared = {
    open,
    onOpenChange: handleOpenChange,
    onCloseAutoFocus: handleCloseAutoFocus,
    headingOrder: 'artist-first',
    centered: true,
    accent,
    artistHref: artistSlug ? `/artists/${artistSlug}` : undefined,
    year: selection.item.year,
  } as const;

  if (selection.kind === 'release') {
    const { item: release } = selection;
    return (
      <ReleasePlayDialog
        {...shared}
        releaseId={release.id}
        title={release.title}
        artistName={artistName}
        takeMediaEl={audio.takeMediaEl}
        sheetOnPhone
        shareWidget={
          <ReleaseShareWidget
            artistSlug={artistSlug}
            artistName={artistName}
            releaseTitle={release.title}
            shareUrl={artistSlug ? releaseDeepLinkUrl(artistSlug, release.id) : undefined}
          />
        }
        footer={
          artistSlug ? (
            <ViewAllLink href={artistReleasesHref(artistSlug)}>View all releases</ViewAllLink>
          ) : undefined
        }
      />
    );
  }

  // Narrowed to the video pick, whose artist always has a name and a page.
  const { item: video, artistName: videoArtist, artistSlug: videoArtistSlug } = selection;
  return (
    <VideoPlayDialog
      {...shared}
      title={video.title}
      artist={videoArtist}
      src={video.streamUrl}
      takeMediaEl={media.takeMediaEl}
      footer={<ViewAllLink href={artistVideosHref(videoArtistSlug)}>View all videos</ViewAllLink>}
      action={
        <AddToPlaylistMenu
          item={videoMediaItem({
            videoId: video.id,
            title: video.title,
            artistName: videoArtist,
            coverArt: video.posterSrc,
            duration: video.durationSeconds,
          })}
        />
      }
    />
  );
};
