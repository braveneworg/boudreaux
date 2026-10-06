/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { usePrimedAudioHandoff } from './use-primed-audio-handoff';

/** State and handlers for a surface that opens the release play dialog. */
export interface ReleasePlayDialogState {
  /** Whether the dialog is open. */
  playerOpen: boolean;
  /** Whether the dialog should fetch the release ahead of opening. */
  prefetchPlayer: boolean;
  /**
   * Call inside the user's play gesture: primes the first track so playback
   * starts within the gesture, then opens the dialog. No-op without a track.
   */
  openPlayer: () => void;
  /** The dialog's `onOpenChange`: closing discards an unclaimed primed element. */
  handlePlayerOpenChange: (open: boolean) => void;
  /** Pre-warm the dialog's release-detail fetch on hover/focus intent. */
  warmPlayer: () => void;
  /** One-shot supplier of the primed element for the dialog's player. */
  takeMediaEl: () => HTMLAudioElement | null;
}

/**
 * The `/releases` Play flow, shared by every surface that opens
 * {@link ReleasePlayDialog}: the click primes track 1 (allowed by every
 * autoplay policy, unlike the player's deferred `play()`), opens the modal,
 * and the modal's player adopts the already-playing element. Closing before
 * the player mounted stops the element so gesture-started audio never leaks.
 *
 * @param playSrc - Stream URL of the release's first MP3 track, or null when
 *   nothing is playable (then {@link ReleasePlayDialogState.openPlayer} is a no-op).
 */
export const useReleasePlayDialog = (playSrc: string | null): ReleasePlayDialogState => {
  const [playerOpen, setPlayerOpen] = useState(false);
  const [prefetchPlayer, setPrefetchPlayer] = useState(false);
  const { primeMediaEl, takeMediaEl, discardMediaEl } = usePrimedAudioHandoff();

  const openPlayer = (): void => {
    if (!playSrc) return;
    primeMediaEl(playSrc);
    setPlayerOpen(true);
  };

  const handlePlayerOpenChange = (open: boolean): void => {
    if (!open) {
      // Closed before the player adopted the element — stop it, or the
      // gesture-started audio keeps playing with no UI attached.
      discardMediaEl();
    }
    setPlayerOpen(open);
  };

  const warmPlayer = (): void => setPrefetchPlayer(true);

  return {
    playerOpen,
    prefetchPlayer,
    openPlayer,
    handlePlayerOpenChange,
    warmPlayer,
    takeMediaEl,
  };
};
