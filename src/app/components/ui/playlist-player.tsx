/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useState } from 'react';

import { AudioPlayer } from './audio-player';

import type Player from 'video.js/dist/types/player';

interface Track {
  id: string;
  title: string;
  artist: string;
  src: string;
  poster?: string; // Add this
}

interface PlaylistPlayerProps {
  tracks: Track[];
}

export const PlaylistPlayer = ({ tracks }: PlaylistPlayerProps) => {
  const [currentTrack, setCurrentTrack] = useState(0);
  const [_player, setPlayer] = useState<Player | null>(null);

  const handlePlayerReady = (playerInstance: Player) => {
    setPlayer(playerInstance);

    // Auto-play next track when current ends
    playerInstance.on('ended', () => {
      if (currentTrack < tracks.length - 1) {
        setCurrentTrack(currentTrack + 1);
      }
    });
  };

  const playTrack = (index: number) => {
    setCurrentTrack(index);
  };

  if (tracks.length === 0) {
    return <div>No tracks available</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-6">
        <h2 className="mb-2 text-3xl font-bold">{tracks[currentTrack].title}</h2>
        <p className="text-gray-600">{tracks[currentTrack].artist}</p>
      </div>

      <AudioPlayer
        src={tracks[currentTrack].src}
        poster={tracks[currentTrack].poster}
        onReady={handlePlayerReady}
      />

      <div className="mt-6">
        <h3 className="mb-3 text-lg font-semibold">Playlist</h3>
        <ul className="space-y-2">
          {tracks.map((track, index) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- track selection in playlist player
            <li
              key={track.id}
              className={`cursor-pointer rounded p-3 transition-colors ${
                index === currentTrack
                  ? 'border-l-4 border-blue-500 bg-blue-100'
                  : 'bg-gray-50 hover:bg-gray-100'
              }`}
              onClick={() => playTrack(index)}
            >
              <div className="font-medium">{track.title}</div>
              <div className="text-sm text-gray-600">{track.artist}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default function Home() {
  const sampleTracks = [
    {
      id: '1',
      title: 'Sample Track 1',
      artist: 'Artist Name',
      src: '/audio/track1.mp3',
    },
    {
      id: '2',
      title: 'Sample Track 2',
      artist: 'Artist Name',
      src: '/audio/track2.mp3',
    },
    {
      id: '3',
      title: 'Sample Track 3',
      artist: 'Artist Name',
      src: '/audio/track3.mp3',
    },
  ];

  return (
    <main className="min-h-screen py-8">
      <h1 className="mb-8 text-center text-4xl font-bold">Audio Player</h1>
      <PlaylistPlayer tracks={sampleTracks} />
    </main>
  );
}
