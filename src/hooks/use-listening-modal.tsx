/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, type ReactElement, type ReactNode } from 'react';

import {
  ReleasePlayDialog,
  type ReleasePlayDialogLayout,
} from '@/app/components/release-play-dialog';
import { ReleaseShareWidget } from '@/app/components/release-share-widget';
import {
  pickLoudZineAccent,
  zineAccentForRelease,
  type ZineAccent,
} from '@/app/components/ui/zine-panel';
import { releaseDeepLinkUrl } from '@/lib/utils/release-deep-link';

import { usePrimedMediaHandoff } from './use-primed-media-handoff';

/** A Release as its listening modal opens it. */
export interface ListeningModalRelease {
  id: string;
  title: string;
  /** The artist the heading and the share text name; `null` names the release alone. */
  artistName: string | null;
  /**
   * The artist whose releases the release deep link lists, or `null` when no
   * artist can be named (ADR-0015): the share row then shares no deep link.
   */
  artistSlug: string | null;
  /**
   * The first MP3 track's stream URL, started inside the opening gesture.
   * `null` opens the modal unprimed, on the player's deferred `play()`.
   */
  playSrc: string | null;
}

/** What an opener decides about its listening modal. */
export interface ListeningModalOptions {
  /**
   * The release the modal shows, or `null` for none (nothing playable, or no
   * search pick yet): then there is no modal.
   */
  release: ListeningModalRelease | null;
  /**
   * The frame's accent: the release's own by default, a page's (`/releases`
   * cyan), or `'random'` for a new loud accent drawn in each opening gesture.
   */
  accent?: ZineAccent | 'random';
  /**
   * What the share row shares: the release deep link (the default), or the
   * artist's page, as the spotlight does (ADR-0023).
   */
  share?: 'release-deep-link' | 'artist-page';
  /** The heading and phone layout (see `ReleasePlayDialogLayout`). */
  layout?: ReleasePlayDialogLayout;
  /** The artist's page: the artist line links there when given. */
  artistHref?: string;
  /** The release year, shown after the title when given. */
  year?: number;
  /** The track the player starts on (see `ReleasePlayer`). */
  initialTrackNumber?: number;
  /** Rendered under the share row, e.g. a "View all releases" link. */
  footer?: ReactNode;
  /** Where focus returns when the modal closes (Radix's close hook). */
  onCloseAutoFocus?: (event: Event) => void;
  /**
   * Open on the first render, unprimed and paused: a release deep link has no
   * gesture to start playback from. Read on the first render only.
   */
  openOnArrival?: boolean;
  /** Runs when the modal closes, dismissed by the visitor or by {@link ListeningModal.close}. */
  onClose?: () => void;
}

/** An opener's handle on its listening modal. */
export interface ListeningModal {
  /**
   * Call inside the opening gesture: starts the release's first track there,
   * when it has one, claiming the playback session, then opens the modal.
   * Pass `pick` when the release was chosen inside this gesture (a search
   * pick), since `release` names it only from the next render on.
   */
  open: (pick?: ListeningModalRelease) => void;
  /** Close from caller code, e.g. a footer link before it navigates. */
  close: () => void;
  /** Start fetching the release detail ahead of the open, on hover or focus. */
  warm: () => void;
  /** The listening modal to render, or `null` without a release. */
  modal: ReactElement | null;
}

/** How the modal was opened: one opened on arrival has no gesture to play from. */
type OpenedBy = 'gesture' | 'arrival';

/** The share row's URL: the release deep link when asked for and nameable. */
const shareUrlFor = (
  { id, artistSlug }: ListeningModalRelease,
  share: ListeningModalOptions['share']
): string | undefined =>
  share !== 'artist-page' && artistSlug ? releaseDeepLinkUrl(artistSlug, id) : undefined;

/** The frame's accent: drawn, given, or the release's own. */
const accentFor = (
  { id }: ListeningModalRelease,
  accent: ListeningModalOptions['accent'],
  drawn: ZineAccent | undefined
): ZineAccent | undefined => {
  if (accent === 'random') return drawn;
  return accent ?? zineAccentForRelease(id);
};

/**
 * The one way to open a Release's listening modal (`ReleasePlayDialog`). The
 * opener says which release and how it is laid out; this module owns the
 * rest: the open state and the hover/focus warm, the track primed inside the
 * opening gesture (allowed by every autoplay policy, unlike the player's
 * deferred `play()`) and handed to the modal's player, the playback-session
 * claim, the accent, and the share row. Closing, or unmounting the opener,
 * before the player took the primed element stops it, so gesture-started
 * audio never plays on without a UI.
 */
export const useListeningModal = ({
  release,
  accent,
  share,
  openOnArrival,
  onClose,
  ...presentation
}: ListeningModalOptions): ListeningModal => {
  const [openedBy, setOpenedBy] = useState<OpenedBy | null>(openOnArrival ? 'arrival' : null);
  const [warmed, setWarmed] = useState(false);
  const [drawnAccent, setDrawnAccent] = useState<ZineAccent>();
  const { primeMediaEl, takeMediaEl, discardMediaEl } = usePrimedMediaHandoff('audio');

  const open = (pick?: ListeningModalRelease): void => {
    const playSrc = (pick ?? release)?.playSrc;
    if (playSrc) primeMediaEl(playSrc);
    if (accent === 'random') setDrawnAccent(pickLoudZineAccent());
    setOpenedBy('gesture');
  };

  const close = (): void => {
    // Closed before the player took the element — stop it, or the
    // gesture-started audio keeps playing with no UI attached.
    discardMediaEl();
    setOpenedBy(null);
    onClose?.();
  };

  const handleOpenChange = (next: boolean): void => {
    if (!next) close();
  };

  const modal = release ? (
    <ReleasePlayDialog
      {...presentation}
      releaseId={release.id}
      title={release.title}
      artistName={release.artistName}
      open={openedBy !== null}
      onOpenChange={handleOpenChange}
      takeMediaEl={takeMediaEl}
      autoPlay={openedBy !== 'arrival'}
      prefetch={warmed}
      accent={accentFor(release, accent, drawnAccent)}
      shareWidget={
        <ReleaseShareWidget
          artistSlug={release.artistSlug}
          artistName={release.artistName}
          releaseTitle={release.title}
          shareUrl={shareUrlFor(release, share)}
        />
      }
    />
  ) : null;

  return { open, close, warm: () => setWarmed(true), modal };
};
