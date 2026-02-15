/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// components/AudioPlayer.tsx
'use client';

import React, { useEffect, useRef } from 'react';

import Image from 'next/image';

import videojs from 'video.js';

import 'video.js/dist/video-js.css';

import type Player from 'video.js/dist/types/player';

interface AudioPlayerProps {
  src: string;
  type?: string;
  poster?: string;
  onReady?: (player: Player) => void;
}

export const AudioPlayer = ({ src, type = 'audio/mp3', poster, onReady }: AudioPlayerProps) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current) {
      const videoElement = document.createElement('video-js');

      // videoElement.classList.add('vjs-big-play-centered');
      videoRef.current?.appendChild(videoElement);

      const player = (playerRef.current = videojs(videoElement, {
        controls: true,
        autoplay: false,
        preload: 'auto',
        responsive: true,
        fluid: true,
        breakpoints: {
          360: {
            width: 300,
            height: 30,
          },
          720: {
            width: 600,
            height: 50,
          },
        },
        // Audio-specific options
        controlBar: {
          volumePanel: {
            inline: true,
          },
        },
        // Mobile-friendly options
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
        userActions: {
          hotkeys: true,
        },
        audioPosterMode: true,
        enableSmoothSeeking: true,
        experimentalSvgIcons: true,
        aspectRatio: '16:9',
      }));

      // Set the source
      player.src({
        src,
        type,
      });

      // You can update the player in the `ready` event:
      player.ready(() => {
        onReady?.(player);
      });
    } else {
      // Update source if it changes
      const player = playerRef.current;
      player.src({
        src,
        type,
      });
    }
  }, [src, type, onReady]);

  // Dispose the Video.js player when the component unmounts
  useEffect(() => {
    const player = playerRef.current;

    return () => {
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex w-full flex-col">
      {poster && (
        <div className="w-[90%] responsive vjs-layout-small	mx-auto overflow-hidden shadow-lg">
          <Image width={380} height={10} src={poster} alt="Album cover" priority />
        </div>
      )}
      <div data-vjs-player className="w-[90%] h-8 responsive mx-auto">
        <div ref={videoRef} />
      </div>
    </div>
  );
};
