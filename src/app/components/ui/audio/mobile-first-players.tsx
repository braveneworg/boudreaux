// ==========================================
// MOBILE-FIRST ELEGANT VIDEO.JS PLAYERS
// Clean, Simple, Mobile-Optimized
// React 19 / Next.js 15
// ==========================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
    displayName: 'Ceschi',
    first: 'Ceschi',
    last: 'Ramos',
    name: 'Ceschi',
    pics: ['pic1.jpg'],
    releases: [
      {
        id: '1',
        title: 'Thank Plath',
        format: 'Digital',
        year: 2021,
        label: 'Label 1',
        catalogNumber: 'CAT001',
        coverArt: '/media/ceschi/thank-plath.jpg',
        bandcampUrl: 'https://ceschi.bandcamp.com',
        releasedOn: '2025-07-24',
        trackUrl: '/media/ceschi/mp3s/Ceschi - Thank Plath.mp3',
      },
    ],
    artists: [],
    bandcampUrl: 'https://ceschi.bandcamp.com',
  },
  {
    id: '2',
    displayName: 'Ceschi',
    first: 'Ceschi',
    last: 'Ramos',
    name: 'Ceschi',
    pics: ['pic1.jpg'],
    releases: [
      {
        id: '2',
        title: 'We Are Enough',
        format: 'Digital',
        year: 2021,
        label: 'Label 1',
        catalogNumber: 'CAT002',
        coverArt: '/media/ceschi/we-are-enough.jpg',
        bandcampUrl: 'https://ceschi.bandcamp.com',
        releasedOn: '2021-06-01',
        trackUrl:
          '/media/ceschi/mp3s/Ceschi - Bring Us The Head Of Francisco False (Part 1) - 03 We Are Enough (produced by Danny T Levin).mp3',
      },
    ],
    artists: [],
    bandcampUrl: 'https://ceschi.bandcamp.com',
  },
  {
    id: '3',
    displayName: 'Ceschi',
    first: 'Ceschi',
    last: 'Ramos',
    name: 'Ceschi',
    pics: ['pic1.jpg'],
    releases: [
      {
        id: '3',
        title: 'Broken Bone Ballads',
        format: 'Digital',
        year: 2021,
        label: 'Label 1',
        catalogNumber: 'CAT003',
        coverArt: '/media/ceschi/broken-bone-ballads.jpeg',
        bandcampUrl: 'https://ceschi.bandcamp.com',
        releasedOn: '2021-06-01',
        trackUrl: '/media/ceschi/mp3s/Ceschi - Broken Bone Ballads.mp3',
      },
    ],
    artists: [],
    bandcampUrl: 'https://ceschi.bandcamp.com',
  },
  {
    id: '4',
    displayName: 'Ceschi',
    first: 'Ceschi',
    last: 'Ramos',
    name: 'Ceschi',
    pics: ['pic1.jpg'],
    releases: [
      {
        id: '4',
        title: 'Broken Bone Ballads (Deluxe)',
        format: 'Digital',
        year: 2021,
        label: 'Label 1',
        catalogNumber: 'CAT004',
        coverArt: '/media/ceschi/broken-bone-ballads.jpeg',
        bandcampUrl: 'https://ceschi.bandcamp.com',
        releasedOn: '2021-06-01',
        trackUrl: '/media/ceschi/mp3s/Ceschi - Broken Bone Ballads.mp3',
      },
    ],
    artists: [],
    bandcampUrl: 'https://ceschi.bandcamp.com',
  },
  {
    id: '5',
    displayName: 'Factor Chandelier',
    first: 'Factor',
    last: 'Chandelier',
    name: 'Factor Chandelier',
    pics: ['pic1.jpg'],
    releases: [
      {
        id: '5',
        title: 'As Dark As Today',
        format: 'Digital',
        year: 2021,
        label: 'Label 1',
        catalogNumber: 'CAT005',
        coverArt: '/media/factor-chandelier/as-dark-as-today.jpg',
        bandcampUrl: 'https://factorchandelier.bandcamp.com',
        releasedOn: '2025-07-24',
        trackUrl: '/media/factor-chandelier/mp3s/Factor Chandelier - As Dark As Today.mp3',
      },
    ],
    artists: [],
    bandcampUrl: 'https://factorchandelier.bandcamp.com',
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

interface TrackInfo {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album: string;
}

export function MobileCardPlayer({
  audioSrc: initialAudioSrc,
  albumArt: initialAlbumArt,
  songTitle: initialSongTitle,
  artist: initialArtist,
  album: initialAlbum,
  onPreviousTrack,
  onNextTrack,
}: MobileCardPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const albumArtRef = useRef<HTMLImageElement>(null);

  const [currentTrack, setCurrentTrack] = useState<TrackInfo>({
    audioSrc: initialAudioSrc,
    albumArt: initialAlbumArt,
    songTitle: initialSongTitle,
    artist: initialArtist,
    album: initialAlbum,
  });

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      responsive: true,
      sources: [{ src: currentTrack.audioSrc, type: 'audio/mp3' }],
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
  }, [currentTrack.audioSrc, onPreviousTrack, onNextTrack]);

  const handleSelect = useCallback((selectedArtist: Artist) => {
    // Get the most recent release from the selected artist
    const sortedReleases = [...selectedArtist.releases].sort(
      (a, b) => new Date(b.releasedOn).getTime() - new Date(a.releasedOn).getTime()
    );

    const latestRelease = sortedReleases[0];

    // Only update if the release has a track URL
    if (latestRelease?.trackUrl) {
      setCurrentTrack({
        audioSrc: latestRelease.trackUrl,
        albumArt: latestRelease.coverArt,
        songTitle: latestRelease.title,
        artist: selectedArtist.displayName,
        album: latestRelease.title,
      });
    }
  }, []);

  // const Button = videojs.getComponent('Button');

  // Register components
  videojs.registerComponent('AudioRewindButton', AudioRewindButton);
  videojs.registerComponent('AudioFastForwardButton', AudioFastForwardButton);
  videojs.registerComponent('SkipPreviousButton', SkipPreviousButton);
  videojs.registerComponent('SkipNextButton', SkipNextButton);

  return (
    <>
      <div>
        <FeaturedArtistsThumbCarousel onSelect={handleSelect} artists={artists} />
        <Image
          ref={albumArtRef}
          src={currentTrack.albumArt}
          alt={`${currentTrack.album} by ${currentTrack.artist}`}
          width={360}
          height={360}
          className="w-full min-w-[322px] aspect-square object-cover rounded-lg border border-solid border-zinc-300 shadow-lg mx-0 p-0 my-3"
        />
      </div>

      {/* Audio Player - Full Width on Mobile, Controls Always Visible */}
      <div className="p-0 m-0">
        <div className="audio-player-wrapper">
          <audio
            ref={audioRef}
            className="video-js vjs-default-skin vjs-audio vjs-has-started w-full"
          />
        </div>
      </div>

      <div className="bg-white opacity-80 background-blur rounded-2xl p-4 sm:p-6 pb-2 sm:pb-3">
        <div className="text-sm text-zinc-900 truncate font-bold">{currentTrack.songTitle}</div>
        <div className="text-sm text-zinc-900">From {currentTrack.album}</div>
        <div className="text-sm text-zinc-900 truncate font-bold">by {currentTrack.artist}</div>
      </div>
    </>
  );
}
