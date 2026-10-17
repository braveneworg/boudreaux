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
import { usePrimedAudioHandoff } from '@/hooks/use-primed-audio-handoff';
import { usePrimedMediaHandoff } from '@/hooks/use-primed-media-handoff';
import { artistReleasesHref } from '@/lib/utils/artist-releases-href';
import { artistVideosHref } from '@/lib/utils/artist-videos-href';

import { AddToPlaylistMenu } from './playlists/add-to-playlist-menu';
import { videoMediaItem } from './playlists/player-media-item';
import { ReleasePlayDialog } from './release-play-dialog';

/** The artist whose search group a picked row sat in: the modal's byline. */
export interface HomeSearchPickArtist {
  artistName: string;
  artistSlug: string;
}

/** What the home search combobox calls, inside the pick's gesture. */
export interface HomeSearchPlayDialogHandle {
  /** Prime the release's first track and open it playing. */
  openRelease: (artist: HomeSearchPickArtist, release: ArtistNavSearchRelease) => void;
  /** Prime the video's stream and open it playing. */
  openVideo: (artist: HomeSearchPickArtist, video: ArtistNavSearchVideo) => void;
}

type HomeSearchSelection = HomeSearchPickArtist & { accent: ZineAccent } & (
    | { kind: 'release'; item: ArtistNavSearchRelease }
    | { kind: 'video'; item: ArtistNavSearchVideo }
  );

interface HomeSearchPlayDialogProps {
  ref: Ref<HomeSearchPlayDialogHandle>;
  /** Where focus goes when the modal closes: the search trigger. */
  returnFocusRef: RefObject<HTMLElement | null>;
  /** Draws each pick's accent; injectable for tests. */
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
 * The play modal behind the home search: a picked release plays in the
 * release modal (a bottom sheet on phones), a picked video in the video
 * modal, each framed in a loud accent drawn per pick, with the artist of the
 * row's search group as a linked byline, the title with its year, and a
 * "View all releases" or "View all videos" link for that artist under the
 * player. The video modal carries the add-to-playlist kebab, which shows
 * only to a signed-in visitor.
 *
 * It owns the primed handoffs, so `openRelease` / `openVideo` start playback
 * inside the pick's gesture; the combobox imports it statically for that
 * reason. Closing stops an element the player never took, and once the modal
 * has gone the pick is discarded and focus returns to the search trigger.
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
      setSelection({ ...artist, kind: 'release', item: release, accent: pickAccent() });
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

  /** Once the modal has gone: forget the pick, focus the search trigger. */
  const handleCloseAutoFocus = (event: Event): void => {
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
    artistHref: `/artists/${artistSlug}`,
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
        footer={<ViewAllLink href={artistReleasesHref(artistSlug)}>View all releases</ViewAllLink>}
      />
    );
  }

  const { item: video } = selection;
  return (
    <VideoPlayDialog
      {...shared}
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
