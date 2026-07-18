/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type Player from 'video.js/dist/types/player';

interface PlayerPrefsState {
  /** Playback volume, 0..1. */
  volume: number;
  muted: boolean;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

const DEFAULT_PREFS = { volume: 1, muted: false };

const clampVolume = (volume: number): number => Math.min(1, Math.max(0, volume));

/**
 * Coerces anything read from durable storage into valid preference values.
 * localStorage outlives deploys and can be edited or corrupted in place, so
 * every rehydrate path must validate — never trust the stored shape.
 */
const sanitizePrefs = (candidate: unknown): { volume: number; muted: boolean } => {
  const prefs = candidate as Partial<PlayerPrefsState> | null | undefined;
  return {
    volume: typeof prefs?.volume === 'number' ? clampVolume(prefs.volume) : DEFAULT_PREFS.volume,
    muted: typeof prefs?.muted === 'boolean' ? prefs.muted : DEFAULT_PREFS.muted,
  };
};

/**
 * Durable player preferences shared by every audio/video player, persisted to
 * localStorage so volume/mute survive browser restarts. Holds only client
 * preference values — playback state stays with each Video.js instance.
 * Nothing renders these values, so no hydration gating is needed; readers use
 * imperative `getState()` inside player callbacks.
 */
export const usePlayerPrefs = create<PlayerPrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      setVolume: (volume) => set({ volume: clampVolume(volume) }),
      setMuted: (muted) => set({ muted }),
    }),
    {
      name: 'boudreaux-player-prefs',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ volume: state.volume, muted: state.muted }),
      // `migrate` only runs on a version MISMATCH; `merge` runs on every
      // rehydrate, so it must sanitize too or a same-version corrupted
      // envelope lands in the store unvalidated.
      migrate: (persistedState) => sanitizePrefs(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePrefs(persistedState),
      }),
    }
  )
);

/**
 * Wires a Video.js player to the shared preference store: applies the stored
 * volume/muted once the player is ready, and writes the player's values back
 * on every `volumechange` (slider drags, mute clicks, hotkeys).
 *
 * Uses only `getState()` — never the `persist` API, which zustand does not
 * attach under SSR or storage-blocked clients. iOS ignores programmatic
 * volume (hardware-controlled); the apply is a silent no-op there and the
 * muted preference still works.
 */
export const bindPlayerVolumePersistence = (player: Player): void => {
  player.ready(() => {
    const { volume, muted } = usePlayerPrefs.getState();
    player.volume(volume);
    player.muted(muted);
  });

  player.on('volumechange', () => {
    const volume = player.volume();
    const muted = player.muted();
    if (typeof volume === 'number') {
      usePlayerPrefs.getState().setVolume(volume);
    }
    if (typeof muted === 'boolean') {
      usePlayerPrefs.getState().setMuted(muted);
    }
  });
};
