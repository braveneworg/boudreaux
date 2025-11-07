// ==========================================
// DEMO PAGE - ALBUM ARTWORK PLAYERS SHOWCASE
// Next.js 15 App Router Implementation
// ==========================================

// app/page.tsx
'use client';

import {
  VinylRecordPlayer,
  CassetteTapePlayer,
  CDPlayer,
  Parallax3DAlbumPlayer,
  PolaroidStackPlayer,
  WaveformAlbumPlayer,
} from '@/components/ui/audio/album-artwork-players';
import {
  SpotifyStylePlayer,
  GlassMorphismPlayer,
  RetroBoomboxPlayer,
  MinimalistGeometricPlayer,
  MagazineCoverPlayer,
} from '@/components/ui/audio/album-artwork-players-2';

export default function AlbumArtworkShowcase() {
  // Sample data - replace with your actual audio sources and artwork
  const sampleTrack = {
    audioSrc: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    albumArt: 'https://picsum.photos/800/800?random=1',
    songTitle: 'Midnight Dreams',
    artist: 'The Sonic Waves',
    album: 'Echoes of Tomorrow',
    year: '2024',
  };

  const playlistTracks = [
    {
      audioSrc: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      albumArt: 'https://picsum.photos/800/800?random=2',
      songTitle: 'Summer Nights',
      artist: 'Coastal Vibes',
      date: 'Aug 2024',
    },
    {
      audioSrc: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
      albumArt: 'https://picsum.photos/800/800?random=3',
      songTitle: 'City Lights',
      artist: 'Urban Echo',
      date: 'Sep 2024',
    },
    {
      audioSrc: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
      albumArt: 'https://picsum.photos/800/800?random=4',
      songTitle: 'Mountain High',
      artist: 'Alpine Dreams',
      date: 'Oct 2024',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Album Artwork Display Examples</h1>
          <p className="mt-2 text-gray-600">
            Creative ways to display album artwork with Video.js audio players in React 19 / Next.js
            15
          </p>
        </div>
      </header>

      {/* Examples Grid */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* 1. Vinyl Record Player */}
        <section className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b bg-gradient-to-r from-amber-50 to-orange-50">
            <h2 className="text-2xl font-bold text-gray-800">1. Vinyl Record Player</h2>
            <p className="text-gray-600 mt-1">Spinning vinyl record with animated tone arm</p>
          </div>
          <VinylRecordPlayer {...sampleTrack} />
        </section>

        {/* 2. Cassette Tape Player */}
        <section className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b bg-gradient-to-r from-purple-50 to-pink-50">
            <h2 className="text-2xl font-bold text-gray-800">2. Cassette Tape Player</h2>
            <p className="text-gray-600 mt-1">Retro cassette with spinning reels</p>
          </div>
          <CassetteTapePlayer {...sampleTrack} side="A" />
        </section>

        {/* 3. CD Player */}
        <section className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b bg-gradient-to-r from-slate-50 to-gray-50">
            <h2 className="text-2xl font-bold text-gray-800">3. CD Player</h2>
            <p className="text-gray-600 mt-1">Spinning CD with holographic effect</p>
          </div>
          <CDPlayer {...sampleTrack} trackNumber={3} totalTracks={12} />
        </section>

        {/* 4. 3D Parallax Album */}
        <section className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
            <h2 className="text-2xl font-bold text-gray-800">4. 3D Parallax Album</h2>
            <p className="text-gray-600 mt-1">
              Interactive 3D album cover that follows mouse movement
            </p>
          </div>
          <Parallax3DAlbumPlayer {...sampleTrack} />
        </section>

        {/* 5. Polaroid Stack */}
        <section className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b bg-gradient-to-r from-amber-50 to-yellow-50">
            <h2 className="text-2xl font-bold text-gray-800">5. Polaroid Stack Player</h2>
            <p className="text-gray-600 mt-1">Stack of polaroid photos for playlist</p>
          </div>
          <PolaroidStackPlayer tracks={playlistTracks} />
        </section>

        {/* 6. Animated Waveform */}
        <section className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b bg-gradient-to-r from-black to-gray-800 text-white">
            <h2 className="text-2xl font-bold">6. Animated Waveform Visualizer</h2>
            <p className="text-gray-300 mt-1">Circular waveform visualization around album art</p>
          </div>
          <WaveformAlbumPlayer {...sampleTrack} />
        </section>

        {/* 7. Spotify Style */}
        <section className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b bg-gradient-to-r from-green-500 to-green-600 text-white">
            <h2 className="text-2xl font-bold">7. Spotify-Style Player</h2>
            <p className="text-green-100 mt-1">Blurred background with modern controls</p>
          </div>
          <SpotifyStylePlayer {...sampleTrack} />
        </section>

        {/* 8. Glass Morphism */}
        <section className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b bg-gradient-to-r from-purple-400 to-pink-400 text-white">
            <h2 className="text-2xl font-bold">8. Glass Morphism Card</h2>
            <p className="text-purple-100 mt-1">Frosted glass effect with colorful background</p>
          </div>
          <GlassMorphismPlayer {...sampleTrack} />
        </section>

        {/* 9. Retro Boombox */}
        <section className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b bg-gradient-to-r from-yellow-400 to-red-500 text-white">
            <h2 className="text-2xl font-bold">9. Retro Boombox</h2>
            <p className="text-yellow-100 mt-1">80s style boombox with animated speakers</p>
          </div>
          <RetroBoomboxPlayer {...sampleTrack} radioStation="FM 89.5" />
        </section>

        {/* 10. Minimalist Geometric */}
        <section className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b bg-gray-100">
            <h2 className="text-2xl font-bold text-gray-800">10. Minimalist Geometric</h2>
            <p className="text-gray-600 mt-1">Clean geometric design with subtle animations</p>
          </div>
          <MinimalistGeometricPlayer {...sampleTrack} accentColor="#FF6B6B" />
        </section>

        {/* 11. Magazine Cover */}
        <section className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b bg-gradient-to-r from-gray-800 to-black text-white">
            <h2 className="text-2xl font-bold">11. Magazine Cover</h2>
            <p className="text-gray-300 mt-1">Album art as magazine cover design</p>
          </div>
          <MagazineCoverPlayer {...sampleTrack} genre="ALTERNATIVE" issue="ISSUE #47" />
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center text-gray-600">
            <p>Built with Video.js, React 19, and Next.js 15</p>
            <p className="mt-2 text-sm">
              Replace sample audio sources with your own streaming URLs
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ==========================================
// USAGE INSTRUCTIONS
// ==========================================

/*
## Installation:

```bash
npm install video.js @types/video.js
```

## Setup Instructions:

1. Create a new Next.js 15 app:
```bash
npx create-next-app@latest my-audio-player --typescript --tailwind --app
```

2. Install Video.js:
```bash
npm install video.js @types/video.js
```

3. Copy the component files:
- Copy `album-artwork-players.tsx` to `app/components/`
- Copy `album-artwork-players-2.tsx` to `app/components/`
- Replace `app/page.tsx` with this demo page

4. Add Video.js CSS to your layout:
```tsx
// app/layout.tsx
import 'video.js/dist/video-js.css'
```

5. Update with your audio sources:
- Replace the sample URLs with your streaming audio URLs
- Replace placeholder images with actual album artwork
- Update song metadata

## Component Props:

All players accept these common props:
- `audioSrc`: URL to audio file or stream
- `albumArt`: URL to album artwork image
- `songTitle`: Name of the song
- `artist`: Artist name

## Customization Examples:

### Using with real streaming URLs:
```tsx
<VinylRecordPlayer
  audioSrc="https://your-stream.m3u8"
  albumArt="/images/album-cover.jpg"
  songTitle="Your Song Title"
  artist="Artist Name"
  album="Album Name"
/>
```

### HLS Streaming:
```tsx
// For HLS streams, update the source type:
sources: [{
  src: 'https://your-hls-stream.m3u8',
  type: 'application/x-mpegURL'
}]
```

### Custom Colors:
```tsx
<MinimalistGeometricPlayer
  {...trackData}
  accentColor="#3B82F6" // Custom accent color
/>
```

## Responsive Design:

All components are responsive and work on mobile devices.
For optimal mobile experience, consider:

```tsx
// Add viewport-based sizing
<div className="w-full max-w-md mx-auto md:max-w-lg lg:max-w-xl">
  <YourPlayer {...props} />
</div>
```

## Performance Optimization:

1. Lazy load components:
```tsx
import dynamic from 'next/dynamic';

const VinylRecordPlayer = dynamic(
  () => import('./components/album-artwork-players').then(mod => mod.VinylRecordPlayer),
  { ssr: false }
);
```

2. Optimize images:
```tsx
import Image from 'next/image';

// Use Next.js Image component for album art
<Image
  src={albumArt}
  alt={songTitle}
  width={320}
  height={320}
  className="w-full h-full object-cover"
/>
```

3. Preload audio:
```tsx
playerRef.current = videojs(audioRef.current, {
  preload: 'metadata', // Only load metadata initially
  // or 'auto' for full preload
});
```

## State Management:

For playlist management across components:

```tsx
// Create a context for shared audio state
import { createContext, useContext, useState } from 'react';

const AudioContext = createContext();

export function AudioProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <AudioContext.Provider value={{
      currentTrack,
      setCurrentTrack,
      isPlaying,
      setIsPlaying
    }}>
      {children}
    </AudioContext.Provider>
  );
}

export const useAudio = () => useContext(AudioContext);
```

## API Integration:

```tsx
// Fetch track data from your API
async function getTrackData(trackId: string) {
  const response = await fetch(`/api/tracks/${trackId}`);
  const data = await response.json();

  return {
    audioSrc: data.streamUrl,
    albumArt: data.artwork,
    songTitle: data.title,
    artist: data.artist,
    album: data.album
  };
}

// Use in component
const [trackData, setTrackData] = useState(null);

useEffect(() => {
  getTrackData('track-123').then(setTrackData);
}, []);

if (!trackData) return <div>Loading...</div>;

return <VinylRecordPlayer {...trackData} />;
```

## Keyboard Controls:

Add keyboard shortcuts to any player:

```tsx
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    switch(e.key) {
      case ' ':
        e.preventDefault();
        playerRef.current?.paused()
          ? playerRef.current?.play()
          : playerRef.current?.pause();
        break;
      case 'ArrowRight':
        playerRef.current?.currentTime(
          playerRef.current.currentTime() + 10
        );
        break;
      case 'ArrowLeft':
        playerRef.current?.currentTime(
          playerRef.current.currentTime() - 10
        );
        break;
    }
  };

  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, []);
```

## Analytics Integration:

Track player events:

```tsx
useEffect(() => {
  if (!playerRef.current) return;

  const player = playerRef.current;

  player.on('play', () => {
    // Send to analytics
    gtag('event', 'audio_play', {
      song_title: songTitle,
      artist: artist
    });
  });

  player.on('ended', () => {
    gtag('event', 'audio_complete', {
      song_title: songTitle,
      artist: artist
    });
  });
}, [songTitle, artist]);
```
*/
