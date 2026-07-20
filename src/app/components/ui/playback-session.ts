/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

interface PlaybackClaim {
  id: string;
  pause: () => void;
}

// Module-scope singleton: at most one player — audio or video — may hold
// playback at a time. Every Video.js instance in the app claims through here,
// so starting any player pauses whichever was playing, whatever its medium.
//
// The claim is deliberately just `{ id, pause }`. This module knows nothing
// about tracks, releases, or videos, which is what lets one session span both
// media without either side learning about the other.
let current: PlaybackClaim | null = null;

/**
 * Claims exclusive playback for `id`. If a different claimant currently holds
 * playback, that claimant's `pause` is invoked first. Re-claiming with the same
 * id never pauses the current claimant (it is already the active one).
 */
export const claimPlayback = (id: string, pause: () => void): void => {
  if (current && current.id !== id) {
    current.pause();
  }
  current = { id, pause };
};

/**
 * Releases playback held by `id`. A release from an id that does not currently
 * hold playback is a no-op, so a stale unmount can never clear a newer claim.
 */
export const releasePlayback = (id: string): void => {
  if (current?.id === id) {
    current = null;
  }
};
