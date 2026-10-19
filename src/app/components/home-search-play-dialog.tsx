/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useImperativeHandle, useState, type ReactElement, type Ref, type RefObject } from 'react';

import Link from 'next/link';

import { pickLoudZineAccent, type ZineAccent } from '@/app/components/ui/zine-panel';
import { VideoPlayDialog } from '@/components/ui/video/video-play-dialog';
import type {
  ArtistNavSearchRelease,
  ArtistNavSearchVideo,
} from '@/hooks/queries/use-artist-nav-search-query';
import {
  useListeningModal,
  type ListeningModalOptions,
  type ListeningModalRelease,
} from '@/hooks/use-listening-modal';
import { usePrimedMediaHandoff } from '@/hooks/use-primed-media-handoff';
import { artistReleasesHref } from '@/lib/utils/artist-releases-href';
import { artistVideosHref } from '@/lib/utils/artist-videos-href';

import { AddToPlaylistMenu } from './playlists/add-to-playlist-menu';
import { videoMediaItem } from './playlists/player-media-item';

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

type HomeSearchReleasePick = HomeSearchReleaseArtist & {
  kind: 'release';
  item: ArtistNavSearchRelease;
};

type HomeSearchSelection =
  | HomeSearchReleasePick
  | (HomeSearchPickArtist & { kind: 'video'; item: ArtistNavSearchVideo; accent: ZineAccent });

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

/** A release pick as its listening modal opens it. */
const toListeningRelease = ({
  artistName,
  artistSlug,
  item,
}: HomeSearchReleasePick): ListeningModalRelease => ({
  id: item.id,
  title: item.title,
  artistName,
  artistSlug,
  playSrc: item.playSrc,
});

/**
 * A release pick's byline: the title's year, and with a public album artist a
 * link to their page and to all their releases.
 */
const releasePickByline = (
  pick: HomeSearchReleasePick | null
): Pick<ListeningModalOptions, 'artistHref' | 'year' | 'footer'> => {
  if (!pick) return {};
  const { artistSlug, item } = pick;
  if (!artistSlug) return { year: item.year };
  return {
    artistHref: `/artists/${artistSlug}`,
    year: item.year,
    footer: <ViewAllLink href={artistReleasesHref(artistSlug)}>View all releases</ViewAllLink>,
  };
};

/**
 * The play modal behind the home and `/releases` searches: a picked release
 * plays in its listening modal (a bottom sheet on phones), framed in the
 * release's own accent and sharing its deep link; a picked video plays in the
 * video modal, framed in a loud accent drawn per pick. Each has the artist as
 * a linked byline, the title with its year, and a "View all releases" or
 * "View all videos" link for that artist under the player (a release whose
 * album artist is hidden has no artist to link). The video modal carries the
 * add-to-playlist kebab, which shows only to a signed-in visitor.
 *
 * It owns both openers, so `openRelease` / `openVideo` start playback inside
 * the pick's gesture; the combobox imports it statically for that reason.
 * Closing stops an element the player never took, and once the closed modal
 * has gone the pick is discarded and focus returns to the search trigger.
 * Hiding the video modal for picture-in-picture is not a close.
 */
export const HomeSearchPlayDialog = ({
  ref,
  returnFocusRef,
  pickAccent = pickLoudZineAccent,
}: HomeSearchPlayDialogProps): ReactElement | null => {
  const [selection, setSelection] = useState<HomeSearchSelection | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const media = usePrimedMediaHandoff('video');

  /** Once a closed modal has gone: forget the pick, focus the search trigger. */
  const forgetPick = (event: Event): void => {
    event.preventDefault();
    setSelection(null);
    returnFocusRef.current?.focus();
  };

  const releasePick = selection?.kind === 'release' ? selection : null;
  const listening = useListeningModal({
    release: releasePick && toListeningRelease(releasePick),
    layout: 'sheet',
    onCloseAutoFocus: forgetPick,
    ...releasePickByline(releasePick),
  });

  useImperativeHandle(ref, () => ({
    openRelease: (artist, release) => {
      const pick: HomeSearchReleasePick = { ...artist, kind: 'release', item: release };
      listening.open(toListeningRelease(pick));
      setSelection(pick);
    },
    openVideo: (artist, video) => {
      if (video.streamUrl) media.primeMediaEl(video.streamUrl);
      setSelection({ ...artist, kind: 'video', item: video, accent: pickAccent() });
      setVideoOpen(true);
    },
  }));

  if (selection?.kind !== 'video') return listening.modal;

  const handleVideoOpenChange = (next: boolean): void => {
    if (!next) {
      // Closed before the player took the element: stop it, or the
      // gesture-started playback goes on with no UI attached.
      media.discardMediaEl();
    }
    setVideoOpen(next);
  };

  /**
   * Radix fires this whenever the dialog's content unmounts, and the video
   * modal unmounts it to hide while its player is in picture-in-picture, still
   * open. Then the pick stays, or the player would be disposed and the modal
   * could never come back. (A picture-in-picture window closed paused closes
   * the modal while it is hidden; the closed pick then waits for the next.)
   */
  const handleVideoCloseAutoFocus = (event: Event): void => {
    if (videoOpen) return;
    forgetPick(event);
  };

  const { item: video, artistName, artistSlug, accent } = selection;
  return (
    <VideoPlayDialog
      open={videoOpen}
      onOpenChange={handleVideoOpenChange}
      onCloseAutoFocus={handleVideoCloseAutoFocus}
      headingOrder="artist-first"
      centered
      accent={accent}
      artistHref={`/artists/${artistSlug}`}
      year={video.year}
      title={video.title}
      artist={artistName}
      src={video.streamUrl}
      takeMediaEl={media.takeMediaEl}
      footer={<ViewAllLink href={artistVideosHref(artistSlug)}>View all videos</ViewAllLink>}
      action={
        <AddToPlaylistMenu
          item={videoMediaItem({
            videoId: video.id,
            title: video.title,
            artistName,
            coverArt: video.posterSrc,
            duration: video.durationSeconds,
          })}
        />
      }
    />
  );
};
