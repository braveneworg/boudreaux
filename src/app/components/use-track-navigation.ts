/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

/** Minimal track-file shape needed to resolve a file's position in the list. */
interface TrackNavItem {
  id: string;
}

interface UseTrackNavigationResult {
  /** Index of the currently selected track within `files`. */
  currentIndex: number;
  /** Imperatively set the current index (e.g. when switching releases). */
  setCurrentIndex: (index: number) => void;
  /** Whether the next source change should auto-play. */
  shouldAutoPlay: boolean;
  /** Imperatively set the auto-play intent. */
  setShouldAutoPlay: (value: boolean) => void;
  /** Select a track by file id; enables auto-play when the file is found. */
  handleFileSelect: (fileId: string) => void;
  /** Advance to the next track on playback end (auto-play). No-op at the end. */
  handleTrackEnded: () => void;
  /** Go to the previous track, preserving the prior playing state. No-op at the start. */
  handlePreviousTrack: (wasPlaying: boolean) => void;
  /** Go to the next track, preserving the prior playing state. No-op at the end. */
  handleNextTrack: (wasPlaying: boolean) => void;
}

/**
 * Shared index-based track navigation for the release/artist players. Owns the
 * current-track index and the `shouldAutoPlay` flag, and exposes file-select +
 * previous/next/ended handlers with identical bounds behavior to the prior
 * inline implementations. Callers derive `currentFile` from `currentIndex`.
 *
 * @param files - Ordered playable files for the current release.
 * @param initialAutoPlay - Initial value for `shouldAutoPlay`.
 */
export const useTrackNavigation = (
  files: readonly TrackNavItem[],
  initialAutoPlay: boolean
): UseTrackNavigationResult => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(initialAutoPlay);

  const handleFileSelect = useCallback(
    (fileId: string) => {
      const index = files.findIndex((f) => f.id === fileId);
      if (index >= 0) {
        setCurrentIndex(index);
        setShouldAutoPlay(true);
      }
    },
    [files]
  );

  const handleTrackEnded = useCallback(() => {
    if (currentIndex < files.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setShouldAutoPlay(true);
    }
  }, [currentIndex, files.length]);

  const handlePreviousTrack = useCallback(
    (wasPlaying: boolean) => {
      if (currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
        setShouldAutoPlay(wasPlaying);
      }
    },
    [currentIndex]
  );

  const handleNextTrack = useCallback(
    (wasPlaying: boolean) => {
      if (currentIndex < files.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        setShouldAutoPlay(wasPlaying);
      }
    },
    [currentIndex, files.length]
  );

  return {
    currentIndex,
    setCurrentIndex,
    shouldAutoPlay,
    setShouldAutoPlay,
    handleFileSelect,
    handleTrackEnded,
    handlePreviousTrack,
    handleNextTrack,
  };
};
