// ==========================================
// MOBILE-FIRST ELEGANT VIDEO.JS PLAYERS
// Clean, Simple, Mobile-Optimized
// React 19 / Next.js 15
// ==========================================

'use client';

import { useEffect, useRef } from 'react';

import Image from 'next/image';

import videojs from 'video.js';

import {
  AudioRewindButton,
  AudioFastForwardButton,
  SkipNextButton,
  SkipPreviousButton,
} from './audio-controls';
import { FeaturedArtistsThumbCarousel } from './featured-artist-thumb-carousel';

import type Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';
import './videojs-audio.css';

const SKIP_TIME = 10; // seconds for rewind/fast-forward
const artists: Artist[] = [
  {
    id: '1',
    displayName: 'Artist 1',
    first: 'First 1',
    last: 'Last 1',
    name: 'Artist One',
    pics: ['pic1.jpg'],
    releases: [
      {
        id: '1',
        title: 'Release 1',
        format: 'Digital',
        year: 2021,
        label: 'Label 1',
        catalogNumber: 'CAT001',
        coverArt: '/media/ceschi/thank-plath.jpg',
        bandcampUrl: 'https://artist1.bandcamp.com',
        releasedOn: 1622505600,
      },
    ],
    artists: [],
    bandcampUrl: 'https://artist1.bandcamp.com',
  },
  {
    id: '2',
    displayName: 'Artist 1',
    first: 'First 1',
    last: 'Last 1',
    name: 'Artist One',
    pics: ['pic1.jpg'],
    releases: [
      {
        id: '2',
        title: 'Release 1',
        format: 'Digital',
        year: 2021,
        label: 'Label 1',
        catalogNumber: 'CAT001',
        coverArt: '/media/ceschi/we-are-enough.jpg',
        bandcampUrl: 'https://artist1.bandcamp.com',
        releasedOn: 1622505600,
      },
    ],
    artists: [],
    bandcampUrl: 'https://artist1.bandcamp.com',
  },
  {
    id: '3',
    displayName: 'Artist 1',
    first: 'First 1',
    last: 'Last 1',
    name: 'Artist One',
    pics: ['pic1.jpg'],
    releases: [
      {
        id: '3',
        title: 'Release 1',
        format: 'Digital',
        year: 2021,
        label: 'Label 1',
        catalogNumber: 'CAT001',
        coverArt: '/media/ceschi/broken-bone-ballads.jpeg',
        bandcampUrl: 'https://artist1.bandcamp.com',
        releasedOn: 1622505600,
      },
    ],
    artists: [],
    bandcampUrl: 'https://artist1.bandcamp.com',
  },
];

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
      preload: 'auto',
      responsive: true,
      sources: [{ src: audioSrc, type: 'audio/mp3' }],
      fluid: false,
      fill: false,
      controlBar: {
        children: [
          'currentTimeDisplay',
          'progressControl',
          'durationDisplay',
          'skipPreviousButton',
          {
            name: 'audioRewindButton',
            seconds: SKIP_TIME,
          },
          'playToggle',
          {
            name: 'audioFastForwardButton',
            seconds: SKIP_TIME,
          },
          'skipNextButton',
          'volumePanel',
        ],
        volumePanel: {
          inline: false, // Show volume slider inline
          vertical: false, // Horizontal orientation
        },
      },
    });

    playerRef.current.ready(() => {
      if (playerRef.current) {
        playerRef.current.addClass('vjs-audio');
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc, onPreviousTrack, onNextTrack]);

  // const Button = videojs.getComponent('Button');

  // Register components
  videojs.registerComponent('AudioRewindButton', AudioRewindButton);
  videojs.registerComponent('AudioFastForwardButton', AudioFastForwardButton);
  videojs.registerComponent('SkipPreviousButton', SkipPreviousButton);
  videojs.registerComponent('SkipNextButton', SkipNextButton);

  return (
    <>
      <div className="px-4 sm:px-6">
        <FeaturedArtistsThumbCarousel artists={artists} />
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
