/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { create } from 'zustand';

import type { MediaPlayerControls } from '@/app/components/ui/audio/media-player';

interface FeaturedPlayerState {
  /** Selected featured-artist ID — null means "derive the first displayable".
   *  IDs only: the FeaturedArtist objects stay in server props (hard boundary). */
  selectedArtistId: string | null;
  /** Selected track file ID — null means "derive the featured/first track". */
  currentFileId: string | null;
  isPlaying: boolean;
  shouldAutoPlay: boolean;
  /** Imperative Video.js handle — non-serializable, in-memory only. */
  playerControls: MediaPlayerControls | null;
  selectArtist: (artistId: string | null, initialFileId: string | null, autoPlay: boolean) => void;
  selectFile: (fileId: string, autoPlay: boolean) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlayerControls: (playerControls: MediaPlayerControls | null) => void;
  resetPlayback: () => void;
}

/**
 * Client state for the home page's featured-artists player. Deliberately NOT
 * persisted: the in-memory store already survives client-side navigation (so
 * returning to the home page restores the last selection), while playback
 * flags and the controls handle are reset on player unmount because Video.js
 * disposes with the component. Browser-write-only — SSR always renders the
 * initial state, so module-level state cannot leak across requests.
 */
export const useFeaturedPlayerStore = create<FeaturedPlayerState>()((set) => ({
  selectedArtistId: null,
  currentFileId: null,
  isPlaying: false,
  shouldAutoPlay: false,
  playerControls: null,
  selectArtist: (artistId, initialFileId, autoPlay) =>
    set({ selectedArtistId: artistId, currentFileId: initialFileId, shouldAutoPlay: autoPlay }),
  selectFile: (fileId, autoPlay) => set({ currentFileId: fileId, shouldAutoPlay: autoPlay }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPlayerControls: (playerControls) => set({ playerControls }),
  resetPlayback: () => set({ isPlaying: false, shouldAutoPlay: false, playerControls: null }),
}));
