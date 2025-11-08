// ==========================================
// MOBILE-FIRST ELEGANT VIDEO.JS PLAYERS
// Clean, Simple, Mobile-Optimized
// React 19 / Next.js 15
// ==========================================

'use client';

import { useEffect, useRef, useState } from 'react';

import Image from 'next/image';

import videojs from 'video.js';

import type Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';

// Constants
const SKIP_TIME = 10; // seconds for rewind/fast-forward

// Type definitions for Video.js
interface VideoJsControlBar {
  addChild: (component: string, options?: { clickHandler?: () => void }) => VideoJsComponent;
  getChild: (name: string) => VideoJsComponent | undefined;
  el: () => HTMLElement;
}

interface VideoJsComponent {
  addClass: (className: string) => void;
  controlText: (text: string) => void;
  el: () => HTMLElement;
}

interface VideoJsPlayerWithControls extends Player {
  controlBar: VideoJsControlBar;
}

interface CustomControlsOptions {
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

// Helper function to add custom buttons to player
const addCustomControls = (player: Player, options?: CustomControlsOptions) => {
  const controlBar = (player as VideoJsPlayerWithControls).controlBar;
  if (!controlBar) return;
  const playButton = controlBar.getChild('playToggle');

  if (!playButton) return;
  const playButtonEl = playButton.el();

  playButtonEl.style.position = 'relative';
  playButtonEl.style.top = '-16px';

  // Get volume control to move it to the end
  const volumePanel = controlBar.getChild('volumePanel');

  // Get progress control and other elements to hide or reposition
  const progressControl = controlBar.getChild('progressControl');

  // Center the control bar content
  const controlBarEl = controlBar.el();
  controlBarEl.style.justifyContent = 'center';
  controlBarEl.style.display = 'flex';
  controlBarEl.style.alignItems = 'center';

  // Create a wrapper for centered controls
  const centerWrapper = document.createElement('div');
  centerWrapper.style.display = 'flex';
  centerWrapper.style.alignItems = 'center';
  centerWrapper.style.gap = '0.5rem';
  centerWrapper.style.position = 'absolute';
  centerWrapper.style.left = '50%';
  centerWrapper.style.transform = 'translateX(-50%)';
  centerWrapper.style.zIndex = '10';

  // Add previous track button (skip back) - if callback provided
  if (options?.onPreviousTrack) {
    const previousTrackButton = controlBar.addChild('button', {
      clickHandler: options.onPreviousTrack,
    });
    previousTrackButton.addClass('vjs-icon-previous-item');
    previousTrackButton.controlText('Previous track');
    previousTrackButton.el().innerHTML = `
      <svg class="vjs-svg-icon" viewBox="0 0 24 24" fill="currentColor" style="width: 2em; height: 2em;">
        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
      </svg>
    `;
    centerWrapper.appendChild(previousTrackButton.el());
  }

  // Add rewind button (10 seconds back) - before skip back
  const rewindButton = controlBar.addChild('button', {
    clickHandler: () => {
      const currentTime = player.currentTime() || 0;
      player.currentTime(Math.max(0, currentTime - SKIP_TIME));
    },
  });
  rewindButton.addClass('vjs-icon-replay-10');
  rewindButton.controlText('Rewind 10 seconds');
  rewindButton.el().innerHTML = `
    <svg class="vjs-svg-icon" viewBox="0 0 24 24" fill="currentColor" style="width: 2em; height: 2em;">
      <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
      <text x="12" y="15" text-anchor="middle" font-size="7" font-weight="bold" fill="currentColor">10</text>
    </svg>
  `;
  centerWrapper.appendChild(rewindButton.el());

  // Move play button to center wrapper
  centerWrapper.appendChild(playButton.el());

  // Add fast forward button (10 seconds ahead) - after play
  const fastForwardButton = controlBar.addChild('button', {
    clickHandler: () => {
      const currentTime = player.currentTime() || 0;
      const duration = player.duration() || 0;
      player.currentTime(Math.min(duration, currentTime + SKIP_TIME));
    },
  });
  fastForwardButton.addClass('vjs-icon-forward-10');
  fastForwardButton.controlText('Fast forward 10 seconds');
  fastForwardButton.el().innerHTML = `
    <svg class="vjs-svg-icon" viewBox="0 0 24 24" fill="currentColor" style="width: 2em; height: 2em;">
      <path d="M4 18l8.5-6L4 6v12zm10.5 0L23 12l-8.5-6v12z"/>
      <text x="12" y="15" text-anchor="middle" font-size="7" font-weight="bold" fill="currentColor">10</text>
    </svg>
  `;
  centerWrapper.appendChild(fastForwardButton.el());

  // Add next track button (skip forward) - after fast forward
  if (options?.onNextTrack) {
    const nextTrackButton = controlBar.addChild('button', {
      clickHandler: options.onNextTrack,
    });
    nextTrackButton.addClass('vjs-icon-next-item');
    nextTrackButton.controlText('Next track');
    nextTrackButton.el().innerHTML = `
      <svg class="vjs-svg-icon" viewBox="0 0 24 24" fill="currentColor" style="width: 2em; height: 2em;">
        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
      </svg>
    `;
    centerWrapper.appendChild(nextTrackButton.el());
  }

  // Add the center wrapper to the control bar
  controlBarEl.appendChild(centerWrapper);

  // Move volume control to the far right if it exists
  if (volumePanel) {
    const volumeEl = volumePanel.el();
    volumeEl.style.position = 'absolute';
    volumeEl.style.right = '0.5rem';
    volumeEl.style.zIndex = '10';
  }

  // Hide progress control from button area but keep it functional
  if (progressControl) {
    const progressEl = progressControl.el();
    progressEl.style.position = 'absolute';
    progressEl.style.top = '0';
    progressEl.style.left = '0';
    progressEl.style.right = '0';
    progressEl.style.height = '0.25rem';
    progressEl.style.zIndex = '1';
  }
};

// ==========================================
// 1. MOBILE CARD PLAYER
// ==========================================
interface MobileCardPlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album: string;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

export function MobileCardPlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  album,
  onPreviousTrack,
  onNextTrack,
}: MobileCardPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: true,
      autoplay: false,
      preload: 'metadata',
      fluid: true,
      fill: true,
      responsive: true,
      sources: [{ src: audioSrc, type: 'audio/mp3' }],
      controlBar: {
        fullscreenToggle: false,
        pictureInPictureToggle: false,
      },
    });

    playerRef.current.ready(() => {
      if (playerRef.current) {
        addCustomControls(playerRef.current, { onPreviousTrack, onNextTrack });
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc, onPreviousTrack, onNextTrack]);

  return (
    <>
      <div className="px-4 sm:px-6">
        <Image
          src={albumArt}
          alt={`${album} by ${artist}`}
          width={380}
          height={380}
          className="w-full aspect-square object-cover rounded-lg"
        />
      </div>

      {/* Audio Player - Full Width on Mobile, Controls Always Visible */}
      <div className="p-4 sm:p-6 pt-4">
        <div className="audio-player-wrapper">
          <audio
            ref={audioRef}
            className="video-js vjs-default-skin vjs-audio vjs-has-started w-full"
          />
        </div>
      </div>

      <div className="bg-white opacity-80 background-blur rounded-2xl p-4 sm:p-6 pb-2 sm:pb-3">
        <div className="text-sm text-zinc-900 truncate font-bold">{songTitle}</div>
        <div className="text-sm text-zinc-900">From {album}</div>
        <div className="text-sm text-zinc-900 truncate font-bold">by {artist}</div>
      </div>
    </>
  );
}

// ==========================================
// 2. FULL SCREEN MOBILE PLAYER
// ==========================================
interface FullScreenMobilePlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album: string;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

export function FullScreenMobilePlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  album,
  onPreviousTrack,
  onNextTrack,
}: FullScreenMobilePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: true,
      autoplay: false,
      preload: 'metadata',
      fluid: true,
      sources: [{ src: audioSrc, type: 'audio/mp3' }],
      controlBar: {
        fullscreenToggle: false,
        pictureInPictureToggle: false,
        volumePanel: {
          inline: true,
        },
      },
    });

    playerRef.current.ready(() => {
      if (playerRef.current) {
        addCustomControls(playerRef.current, { onPreviousTrack, onNextTrack });
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc, onPreviousTrack, onNextTrack]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col">
      {/* Metadata - Sticky Header on Mobile */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 p-4 sm:p-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">{songTitle}</h1>
        <p className="text-base sm:text-lg text-gray-600 truncate">{album}</p>
        <p className="text-sm sm:text-base text-gray-500 truncate">{artist}</p>
      </div>

      {/* Album Art - Fills Available Space */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative">
        <Image
          src={albumArt}
          alt={`${album} by ${artist}`}
          fill
          className="object-contain rounded-2xl shadow-2xl"
          sizes="(max-width: 768px) 90vw, 512px"
          priority
        />
      </div>

      {/* Audio Player - Fixed at Bottom on Mobile */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 sm:p-6 z-20">
        <div className="audio-player-wrapper">
          <audio
            ref={audioRef}
            className="video-js vjs-default-skin vjs-audio vjs-has-started w-full"
          />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. COMPACT MOBILE PLAYER
// ==========================================
interface CompactMobilePlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album: string;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

export function CompactMobilePlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  album,
  onPreviousTrack,
  onNextTrack,
}: CompactMobilePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: true,
      autoplay: false,
      preload: 'metadata',
      fluid: true,
      sources: [{ src: audioSrc, type: 'audio/mp3' }],
      controlBar: {
        fullscreenToggle: false,
        pictureInPictureToggle: false,
        volumePanel: {
          inline: true,
        },
        playToggle: true,
        progressControl: true,
        currentTimeDisplay: false,
        timeDivider: false,
        durationDisplay: false,
        remainingTimeDisplay: true,
      },
    });

    playerRef.current.ready(() => {
      if (playerRef.current) {
        addCustomControls(playerRef.current, { onPreviousTrack, onNextTrack });
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc, onPreviousTrack, onNextTrack]);

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Compact Header */}
      <div className="text-center mb-3 px-4">
        <h3 className="text-lg font-medium text-gray-900 truncate">{songTitle}</h3>
        <p className="text-sm text-gray-600 truncate">
          {album} • {artist}
        </p>
      </div>

      {/* Album Art */}
      <div className="px-4 mb-4 relative aspect-square">
        <Image
          src={albumArt}
          alt={`${album} by ${artist}`}
          fill
          className="object-cover rounded-xl shadow-md"
          sizes="100vw"
          priority
        />
      </div>

      {/* Compact Player */}
      <div className="px-4 pb-4">
        <div className="audio-player-wrapper">
          <audio
            ref={audioRef}
            className="video-js vjs-default-skin vjs-audio vjs-has-started w-full"
          />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. SWIPEABLE MOBILE PLAYER
// ==========================================
interface SwipeableMobilePlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album: string;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

export function SwipeableMobilePlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  album,
  onPreviousTrack,
  onNextTrack,
}: SwipeableMobilePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: true,
      autoplay: false,
      preload: 'metadata',
      fluid: true,
      sources: [{ src: audioSrc, type: 'audio/mp3' }],
      controlBar: {
        fullscreenToggle: false,
        pictureInPictureToggle: false,
      },
    });

    playerRef.current.ready(() => {
      if (playerRef.current) {
        addCustomControls(playerRef.current, { onPreviousTrack, onNextTrack });
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc, onPreviousTrack, onNextTrack]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && onNextTrack) {
      onNextTrack();
    }
    if (isRightSwipe && onPreviousTrack) {
      onPreviousTrack();
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-gray-50 rounded-3xl p-4 sm:p-6">
      {/* Metadata */}
      <div className="text-center mb-4">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">{songTitle}</h2>
        <p className="text-sm sm:text-base text-gray-600 mt-1">{album}</p>
        <p className="text-sm text-gray-500">{artist}</p>
      </div>

      {/* Swipeable Album Art */}
      <div
        className="mb-6 touch-pan-y relative aspect-square"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          src={albumArt}
          alt={`${album} by ${artist}`}
          fill
          className="object-cover rounded-2xl shadow-lg select-none"
          draggable={false}
          sizes="100vw"
          priority
        />
        <p className="text-xs text-center text-gray-400 mt-2">← Swipe for tracks →</p>
      </div>

      {/* Audio Player */}
      <audio ref={audioRef} className="video-js vjs-default-skin vjs-audio w-full" />
    </div>
  );
}

// ==========================================
// 5. MINIMAL MOBILE PLAYER
// ==========================================
interface MinimalMobilePlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album: string;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

export function MinimalMobilePlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  album,
  onPreviousTrack,
  onNextTrack,
}: MinimalMobilePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: true,
      autoplay: false,
      preload: 'metadata',
      fluid: true,
      sources: [{ src: audioSrc, type: 'audio/mp3' }],
      controlBar: {
        fullscreenToggle: false,
        pictureInPictureToggle: false,
        volumePanel: {
          inline: true,
        },
      },
    });

    playerRef.current.ready(() => {
      if (playerRef.current) {
        addCustomControls(playerRef.current, { onPreviousTrack, onNextTrack });
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc, onPreviousTrack, onNextTrack]);

  return (
    <div className="w-full max-w-screen-sm mx-auto p-4">
      {/* Minimal Metadata */}
      <div className="mb-4">
        <h2 className="text-2xl font-light text-gray-900">{songTitle}</h2>
        <p className="text-gray-600">
          {album} • {artist}
        </p>
      </div>

      {/* Album Art */}
      <div className="mb-6 relative aspect-square">
        <Image
          src={albumArt}
          alt={`${album} by ${artist}`}
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
      </div>

      {/* Audio Player - Controls Always Visible */}
      <div className="px-4 pb-4">
        <div className="audio-player-wrapper">
          <audio
            ref={audioRef}
            className="video-js vjs-default-skin vjs-audio vjs-has-started w-full"
          />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 6. BOTTOM SHEET PLAYER
// ==========================================
interface BottomSheetPlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album: string;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

export function BottomSheetPlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  album,
  onPreviousTrack,
  onNextTrack,
}: BottomSheetPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: true,
      autoplay: false,
      preload: 'metadata',
      fluid: true,
      sources: [{ src: audioSrc, type: 'audio/mp3' }],
      controlBar: {
        fullscreenToggle: false,
        pictureInPictureToggle: false,
      },
    });

    playerRef.current.ready(() => {
      if (playerRef.current) {
        addCustomControls(playerRef.current, { onPreviousTrack, onNextTrack });
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc, onPreviousTrack, onNextTrack]);

  return (
    <>
      {/* Main Content Area */}
      <div className="min-h-screen bg-gray-100 pb-24">
        {/* Expanded View */}
        {isExpanded && (
          <div className="fixed inset-0 bg-white z-50 flex flex-col">
            {/* Close Button */}
            <button onClick={() => setIsExpanded(false)} className="p-4 text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Metadata */}
            <div className="px-6 mb-6 text-center">
              <h1 className="text-3xl font-bold text-gray-900">{songTitle}</h1>
              <p className="text-lg text-gray-600 mt-2">{album}</p>
              <p className="text-gray-500">{artist}</p>
            </div>

            {/* Large Album Art */}
            <div className="flex-1 flex items-center justify-center px-6 relative">
              <Image
                src={albumArt}
                alt={`${album} by ${artist}`}
                width={512}
                height={512}
                className="w-full max-w-md aspect-square object-cover rounded-2xl shadow-2xl"
                sizes="(max-width: 768px) 90vw, 512px"
                priority
              />
            </div>

            {/* Player Controls */}
            <div className="p-6">
              <div className="audio-player-wrapper">
                <audio
                  ref={audioRef}
                  className="video-js vjs-default-skin vjs-audio vjs-has-started w-full"
                />
              </div>
            </div>
          </div>
        )}

        {/* Collapsed Bottom Sheet */}
        {!isExpanded && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
            <button
              onClick={() => setIsExpanded(true)}
              className="w-full p-4 flex items-center space-x-3"
            >
              <div className="relative w-12 h-12">
                <Image
                  src={albumArt}
                  alt={`${album} by ${artist}`}
                  fill
                  className="rounded object-cover"
                  sizes="48px"
                />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900 truncate">{songTitle}</p>
                <p className="text-sm text-gray-600 truncate">{artist}</p>
              </div>
              <svg
                className="w-6 h-6 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ==========================================
// 7. STORY-STYLE PLAYER
// ==========================================
interface StoryStylePlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album: string;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

export function StoryStylePlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  album,
  onPreviousTrack,
  onNextTrack,
}: StoryStylePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: true,
      autoplay: false,
      preload: 'metadata',
      fluid: true,
      sources: [{ src: audioSrc, type: 'audio/mp3' }],
      controlBar: {
        fullscreenToggle: false,
        pictureInPictureToggle: false,
        volumePanel: false,
        playToggle: true,
        progressControl: true,
        currentTimeDisplay: false,
        timeDivider: false,
        durationDisplay: false,
      },
    });

    playerRef.current.ready(() => {
      if (playerRef.current) {
        addCustomControls(playerRef.current, { onPreviousTrack, onNextTrack });
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc, onPreviousTrack, onNextTrack]);

  return (
    <div className="w-full max-w-md mx-auto bg-black rounded-3xl overflow-hidden">
      {/* Story Header */}
      <div className="bg-gradient-to-b from-black/50 to-transparent absolute top-0 left-0 right-0 z-10 p-4">
        <h2 className="text-white font-semibold text-lg truncate">{songTitle}</h2>
        <p className="text-white/80 text-sm truncate">
          {album} • {artist}
        </p>
      </div>

      {/* Full Height Album Art */}
      <div className="relative aspect-[9/16]">
        <Image
          src={albumArt}
          alt={`${album} by ${artist}`}
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />

        {/* Gradient Overlay at Bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent h-32" />
      </div>

      {/* Player at Bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
        <div className="audio-player-wrapper">
          <audio
            ref={audioRef}
            className="video-js vjs-default-skin vjs-audio vjs-has-started w-full"
          />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 8. RESPONSIVE GRID PLAYER
// ==========================================
interface ResponsiveGridPlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album: string;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

export function ResponsiveGridPlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  album,
  onPreviousTrack,
  onNextTrack,
}: ResponsiveGridPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: true,
      autoplay: false,
      preload: 'metadata',
      fluid: true,
      responsive: true,
      sources: [{ src: audioSrc, type: 'audio/mp3' }],
      controlBar: {
        fullscreenToggle: false,
        pictureInPictureToggle: false,
      },
    });

    playerRef.current.ready(() => {
      if (playerRef.current) {
        addCustomControls(playerRef.current, { onPreviousTrack, onNextTrack });
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc, onPreviousTrack, onNextTrack]);

  return (
    <div className="w-full h-full min-h-[400px] flex flex-col">
      {/* Metadata */}
      <div className="p-3 sm:p-4 bg-white">
        <h3 className="text-lg sm:text-xl font-medium text-gray-900 truncate">{songTitle}</h3>
        <p className="text-sm text-gray-600 truncate">
          {album} • {artist}
        </p>
      </div>

      {/* Album Art - Responsive */}
      <div className="flex-1 bg-gray-100 relative">
        <Image
          src={albumArt}
          alt={`${album} by ${artist}`}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
        />
      </div>

      {/* Audio Player */}
      <div className="p-3 sm:p-4 bg-white border-t">
        <div className="audio-player-wrapper">
          <audio
            ref={audioRef}
            className="video-js vjs-default-skin vjs-audio vjs-has-started w-full"
          />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// USAGE EXAMPLE
// ==========================================
/*
// app/layout.tsx
import 'video.js/dist/video-js.css';

// app/page.tsx
import { MobileCardPlayer } from './components/mobile-players';

export default function App() {
  const track = {
    audioSrc: 'your-audio-url.mp3',
    albumArt: 'your-album-art.jpg',
    songTitle: 'Song Name',
    artist: 'Artist Name',
    album: 'Album Name'
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <MobileCardPlayer {...track} />
    </div>
  );
}

// Add custom styles to globals.css
@import url('./mobile-player-styles.css');
*/
