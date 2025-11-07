// ==========================================
// MORE ALBUM ARTWORK DISPLAY EXAMPLES
// Video.js + React 19 / Next.js 15
// ==========================================

'use client';

import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';

// ==========================================
// 7. SPOTIFY-STYLE BLURRED BACKGROUND
// ==========================================
interface SpotifyStylePlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album: string;
  year?: string;
}

export function SpotifyStylePlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  album,
  year
}: SpotifyStylePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isLiked, setIsLiked] = useState(false);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: false,
      sources: [{ src: audioSrc, type: 'audio/mp3' }]
    });

    const player = playerRef.current;
    
    player.on('play', () => setIsPlaying(true));
    player.on('pause', () => setIsPlaying(false));
    player.on('timeupdate', () => {
      setCurrentTime(player.currentTime() || 0);
      setDuration(player.duration() || 0);
    });

    player.volume(volume);

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (playerRef.current) {
      playerRef.current.currentTime(newTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (playerRef.current) {
      playerRef.current.volume(newVolume);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Blurred Background */}
      <div 
        className="absolute inset-0 scale-110 blur-3xl opacity-60"
        style={{
          backgroundImage: `url(${albumArt})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-black/90" />
      
      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col justify-center items-center p-8">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Album Art */}
          <div className="flex justify-center lg:justify-end">
            <div className="relative group">
              <img 
                src={albumArt} 
                alt={album}
                className="w-80 h-80 rounded-lg shadow-2xl"
              />
              {/* Hover Effect */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <div className="text-white text-center">
                  <p className="text-sm mb-1">{album}</p>
                  {year && <p className="text-xs opacity-70">{year}</p>}
                </div>
              </div>
            </div>
          </div>
          
          {/* Player Controls */}
          <div className="space-y-8">
            {/* Song Info */}
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">{songTitle}</h1>
              <p className="text-xl text-gray-300">{artist}</p>
            </div>
            
            {/* Progress Bar */}
            <div>
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #1db954 0%, #1db954 ${(currentTime / duration) * 100}%, #4a5568 ${(currentTime / duration) * 100}%, #4a5568 100%)`
                }}
              />
              <div className="flex justify-between mt-2 text-sm text-gray-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
            
            {/* Main Controls */}
            <div className="flex items-center justify-center gap-6">
              <button className="text-gray-400 hover:text-white transition">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
                </svg>
              </button>
              
              <button className="text-gray-400 hover:text-white transition">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
                </svg>
              </button>
              
              <button 
                onClick={() => playerRef.current && (isPlaying ? playerRef.current.pause() : playerRef.current.play())}
                className="p-4 bg-white rounded-full text-black hover:scale-105 transition"
              >
                {isPlaying ? (
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              
              <button className="text-gray-400 hover:text-white transition">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
                </svg>
              </button>
              
              <button 
                onClick={() => setIsLiked(!isLiked)}
                className={`transition ${isLiked ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
              >
                <svg className="w-6 h-6" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            </div>
            
            {/* Volume Control */}
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="w-32 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
        
        <audio ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}

// ==========================================
// 8. GLASS MORPHISM FLOATING CARD
// ==========================================
interface GlassMorphismPlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
}

export function GlassMorphismPlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist
}: GlassMorphismPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: false,
      sources: [{ src: audioSrc, type: 'audio/mp3' }]
    });

    const player = playerRef.current;
    
    player.on('play', () => setIsPlaying(true));
    player.on('pause', () => setIsPlaying(false));
    player.on('timeupdate', () => {
      const current = player.currentTime() || 0;
      const duration = player.duration() || 1;
      setProgress((current / duration) * 100);
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc]);

  return (
    <div className="min-h-[600px] bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-8 flex items-center justify-center">
      {/* Background Shapes */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-72 h-72 bg-purple-400 rounded-full blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-pink-400 rounded-full blur-3xl opacity-30 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-orange-400 rounded-full blur-3xl opacity-30 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>
      
      {/* Glass Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20">
          {/* Album Art */}
          <div className="relative mb-8">
            <img 
              src={albumArt} 
              alt={songTitle}
              className="w-full h-80 object-cover rounded-2xl shadow-xl"
            />
            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent rounded-2xl"></div>
            
            {/* Floating Play Button */}
            <button 
              onClick={() => playerRef.current && (isPlaying ? playerRef.current.pause() : playerRef.current.play())}
              className="absolute bottom-4 right-4 p-3 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition"
            >
              {isPlaying ? (
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          </div>
          
          {/* Song Info */}
          <div className="text-white mb-6">
            <h3 className="text-2xl font-bold mb-1">{songTitle}</h3>
            <p className="text-white/80">{artist}</p>
          </div>
          
          {/* Progress Bar */}
          <div className="relative h-2 bg-white/20 rounded-full overflow-hidden backdrop-blur">
            <div 
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-white/80 to-white/60 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            >
              {/* Glow Effect */}
              <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-white rounded-full blur-md"></div>
            </div>
          </div>
          
          {/* Additional Controls */}
          <div className="flex justify-between items-center mt-6">
            <button className="text-white/60 hover:text-white transition">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
              </svg>
            </button>
            
            <div className="flex gap-4">
              <button className="text-white/60 hover:text-white transition">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
                </svg>
              </button>
              <button className="text-white/60 hover:text-white transition">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
                </svg>
              </button>
            </div>
            
            <button className="text-white/60 hover:text-white transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>
        
        <audio ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}

// ==========================================
// 9. RETRO BOOMBOX PLAYER
// ==========================================
interface RetroBoomboxPlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  radioStation?: string;
}

export function RetroBoomboxPlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  radioStation = "FM 101.5"
}: RetroBoomboxPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [bass, setBass] = useState(0.5);
  const [treble, setTreble] = useState(0.5);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: false,
      sources: [{ src: audioSrc, type: 'audio/mp3' }]
    });

    const player = playerRef.current;
    
    player.on('play', () => setIsPlaying(true));
    player.on('pause', () => setIsPlaying(false));
    player.volume(volume);

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc]);

  return (
    <div className="min-h-[600px] bg-gradient-to-br from-yellow-400 via-red-500 to-pink-500 p-8 flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg p-6 shadow-2xl">
        {/* Top Handle */}
        <div className="flex justify-center mb-4">
          <div className="w-32 h-3 bg-gray-700 rounded-full"></div>
        </div>
        
        {/* Main Body */}
        <div className="bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg p-6">
          {/* Speakers and Display */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Left Speaker */}
            <div className="bg-black rounded-full p-4 shadow-inner">
              <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center">
                <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center">
                  <div className="w-12 h-12 bg-gray-900 rounded-full animate-pulse" style={{animationDuration: isPlaying ? '0.5s' : '0s'}}></div>
                </div>
              </div>
            </div>
            
            {/* Center Display */}
            <div className="bg-green-950 rounded p-4 font-mono text-green-400">
              <div className="text-xs mb-2">{radioStation}</div>
              <div className="h-16 w-32 mx-auto mb-2 bg-black rounded overflow-hidden">
                <img 
                  src={albumArt} 
                  alt={songTitle}
                  className="w-full h-full object-cover opacity-80"
                />
              </div>
              <div className="text-xs truncate">{songTitle}</div>
              <div className="text-xs truncate opacity-70">{artist}</div>
            </div>
            
            {/* Right Speaker */}
            <div className="bg-black rounded-full p-4 shadow-inner">
              <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center">
                <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center">
                  <div className="w-12 h-12 bg-gray-900 rounded-full animate-pulse" style={{animationDuration: isPlaying ? '0.5s' : '0s'}}></div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Control Panel */}
          <div className="bg-gray-600 rounded p-4">
            {/* Main Buttons */}
            <div className="flex justify-center gap-2 mb-4">
              <button className="px-4 py-2 bg-gray-700 hover:bg-gray-800 rounded text-white text-sm transition">
                REW
              </button>
              <button 
                onClick={() => playerRef.current && (isPlaying ? playerRef.current.pause() : playerRef.current.play())}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded text-white transition"
              >
                {isPlaying ? 'STOP' : 'PLAY'}
              </button>
              <button className="px-4 py-2 bg-gray-700 hover:bg-gray-800 rounded text-white text-sm transition">
                FF
              </button>
            </div>
            
            {/* Knobs */}
            <div className="grid grid-cols-3 gap-4">
              {/* Volume */}
              <div className="text-center">
                <div className="text-xs text-gray-300 mb-1">VOLUME</div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setVolume(val);
                    if (playerRef.current) playerRef.current.volume(val);
                  }}
                  className="w-full"
                />
              </div>
              
              {/* Bass */}
              <div className="text-center">
                <div className="text-xs text-gray-300 mb-1">BASS</div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={bass}
                  onChange={(e) => setBass(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              
              {/* Treble */}
              <div className="text-center">
                <div className="text-xs text-gray-300 mb-1">TREBLE</div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={treble}
                  onChange={(e) => setTreble(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>
        
        <audio ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}

// ==========================================
// 10. MINIMALIST GEOMETRIC PLAYER
// ==========================================
interface MinimalistGeometricPlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  accentColor?: string;
}

export function MinimalistGeometricPlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  accentColor = '#FF6B6B'
}: MinimalistGeometricPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: false,
      sources: [{ src: audioSrc, type: 'audio/mp3' }]
    });

    const player = playerRef.current;
    
    player.on('play', () => setIsPlaying(true));
    player.on('pause', () => setIsPlaying(false));
    player.on('timeupdate', () => {
      const current = player.currentTime() || 0;
      const duration = player.duration() || 1;
      setProgress((current / duration) * 100);
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc]);

  return (
    <div className="min-h-[600px] bg-gray-50 p-8 flex items-center justify-center">
      <div className="relative w-full max-w-4xl">
        {/* Geometric Shapes Background */}
        <div className="absolute -top-10 -left-10 w-40 h-40 border-4 border-gray-200 rotate-45"></div>
        <div className="absolute -bottom-10 -right-10 w-32 h-32 border-4 border-gray-200 rounded-full"></div>
        <div 
          className="absolute top-1/2 left-1/4 w-24 h-24 opacity-20 rotate-12"
          style={{ backgroundColor: accentColor }}
        ></div>
        
        {/* Main Content */}
        <div className="relative bg-white rounded-none shadow-2xl p-12">
          <div className="grid grid-cols-2 gap-12">
            {/* Album Art */}
            <div className="relative">
              <div 
                className="absolute -top-4 -left-4 w-full h-full border-2"
                style={{ borderColor: accentColor }}
              ></div>
              <img 
                src={albumArt} 
                alt={songTitle}
                className="relative w-full aspect-square object-cover grayscale hover:grayscale-0 transition-all duration-500"
              />
              {/* Progress Overlay */}
              <div 
                className="absolute bottom-0 left-0 h-1 bg-black transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            
            {/* Info and Controls */}
            <div className="flex flex-col justify-between">
              <div>
                <h1 className="text-4xl font-light mb-2 uppercase tracking-wider">{songTitle}</h1>
                <p className="text-xl text-gray-600 uppercase tracking-wide">{artist}</p>
                
                {/* Decorative Line */}
                <div 
                  className="w-20 h-0.5 mt-8 mb-8"
                  style={{ backgroundColor: accentColor }}
                ></div>
              </div>
              
              {/* Controls */}
              <div className="space-y-8">
                {/* Progress Text */}
                <div className="font-mono text-sm text-gray-500">
                  {Math.floor(progress)}% COMPLETE
                </div>
                
                {/* Control Buttons */}
                <div className="flex items-center gap-8">
                  <button 
                    onClick={() => playerRef.current && (isPlaying ? playerRef.current.pause() : playerRef.current.play())}
                    className="relative w-16 h-16 border-2 border-black hover:border-gray-600 transition group"
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      {isPlaying ? (
                        <div className="flex gap-1">
                          <div className="w-1 h-6 bg-black group-hover:bg-gray-600"></div>
                          <div className="w-1 h-6 bg-black group-hover:bg-gray-600"></div>
                        </div>
                      ) : (
                        <div 
                          className="w-0 h-0 ml-1 border-l-[12px] border-t-[8px] border-b-[8px] border-t-transparent border-b-transparent"
                          style={{ borderLeftColor: 'black' }}
                        ></div>
                      )}
                    </div>
                  </button>
                  
                  <button className="text-gray-400 hover:text-black transition">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                      <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                  </button>
                  
                  <button className="text-gray-400 hover:text-black transition">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                      <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <audio ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}

// ==========================================
// 11. MAGAZINE COVER PLAYER
// ==========================================
interface MagazineCoverPlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album: string;
  genre?: string;
  issue?: string;
}

export function MagazineCoverPlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  album,
  genre = "INDIE",
  issue = "VOL. 23"
}: MagazineCoverPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: false,
      sources: [{ src: audioSrc, type: 'audio/mp3' }]
    });

    const player = playerRef.current;
    
    player.on('play', () => setIsPlaying(true));
    player.on('pause', () => setIsPlaying(false));

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc]);

  return (
    <div className="min-h-[700px] bg-gray-100 p-8 flex items-center justify-center">
      <div className="relative w-[400px] h-[550px] bg-white shadow-2xl">
        {/* Magazine Header */}
        <div className="absolute top-0 left-0 right-0 z-20 p-6">
          <div className="flex justify-between items-start text-white">
            <div>
              <h1 className="text-4xl font-bold tracking-tighter">SOUND</h1>
              <p className="text-xs tracking-widest mt-1">{issue}</p>
            </div>
            <div className="text-right">
              <p className="text-xs">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
              <p className="text-xs font-bold mt-1">{genre}</p>
            </div>
          </div>
        </div>
        
        {/* Album Art as Cover */}
        <img 
          src={albumArt} 
          alt={album}
          className="w-full h-full object-cover"
        />
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/50"></div>
        
        {/* Bottom Content */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-6 text-white">
          <div className="mb-6">
            <h2 className="text-3xl font-bold mb-2">{artist}</h2>
            <p className="text-lg font-light">{album}</p>
            <p className="text-sm mt-2 italic">"{ songTitle}"</p>
          </div>
          
          {/* Feature Tags */}
          <div className="flex gap-2 mb-6 flex-wrap">
            <span className="px-2 py-1 border border-white text-xs">EXCLUSIVE</span>
            <span className="px-2 py-1 border border-white text-xs">INTERVIEW</span>
            <span className="px-2 py-1 border border-white text-xs">BEHIND THE SCENES</span>
          </div>
          
          {/* Play Button */}
          <button 
            onClick={() => playerRef.current && (isPlaying ? playerRef.current.pause() : playerRef.current.play())}
            className="w-full py-3 bg-white text-black font-bold hover:bg-gray-100 transition flex items-center justify-center gap-2"
          >
            {isPlaying ? (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
                <span>NOW PLAYING</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>LISTEN NOW</span>
              </>
            )}
          </button>
        </div>
        
        {/* Barcode */}
        <div className="absolute bottom-6 right-6 w-16 h-8 bg-white p-1">
          <div className="flex h-full gap-0.5">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex-1 bg-black" style={{height: `${50 + Math.random() * 50}%`}}></div>
            ))}
          </div>
        </div>
        
        <audio ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}