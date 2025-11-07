// ==========================================
// ALBUM ARTWORK DISPLAY EXAMPLES
// Video.js + React 19 / Next.js 15
// ==========================================

'use client';

import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';

// ==========================================
// 1. VINYL RECORD PLAYER
// ==========================================
interface VinylRecordPlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album?: string;
}

export function VinylRecordPlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  album
}: VinylRecordPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rotation, setRotation] = useState(0);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: false,
      sources: [{ src: audioSrc, type: 'audio/mp3' }]
    });

    const player = playerRef.current;
    
    player.on('play', () => {
      setIsPlaying(true);
      startRotation();
    });
    
    player.on('pause', () => {
      setIsPlaying(false);
      stopRotation();
    });

    return () => {
      stopRotation();
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc]);

  const startRotation = () => {
    const animate = () => {
      setRotation(prev => (prev + 1) % 360);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
  };

  const stopRotation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const handlePlayPause = () => {
    if (playerRef.current) {
      if (isPlaying) {
        playerRef.current.pause();
      } else {
        playerRef.current.play();
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[500px] bg-gradient-to-br from-amber-50 to-orange-100 p-8 rounded-xl">
      <div className="flex gap-8 items-center">
        {/* Vinyl Record */}
        <div className="relative">
          {/* Record Shadow */}
          <div className="absolute inset-0 bg-black/20 rounded-full blur-xl translate-y-4"></div>
          
          {/* Record Base */}
          <div 
            className="relative w-80 h-80 rounded-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 shadow-2xl"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            {/* Grooves */}
            <div className="absolute inset-2 rounded-full border border-gray-700"></div>
            <div className="absolute inset-4 rounded-full border border-gray-700"></div>
            <div className="absolute inset-6 rounded-full border border-gray-700"></div>
            <div className="absolute inset-8 rounded-full border border-gray-700"></div>
            
            {/* Center Label */}
            <div className="absolute inset-[30%] rounded-full overflow-hidden border-4 border-gray-900 shadow-inner">
              <img 
                src={albumArt} 
                alt={album}
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* Center Hole */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-gray-900 rounded-full"></div>
            
            {/* Reflection */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/10 to-transparent"></div>
          </div>
          
          {/* Tone Arm */}
          <div 
            className={`absolute top-1/2 -right-16 w-32 h-1 bg-gradient-to-r from-gray-600 to-gray-400 origin-left transition-transform duration-500 ${
              isPlaying ? 'rotate-[-15deg]' : 'rotate-[-25deg]'
            }`}
          >
            <div className="absolute right-0 w-3 h-3 bg-gray-400 rounded-full -top-1"></div>
          </div>
        </div>

        {/* Controls and Info */}
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-800">{songTitle}</h2>
            <p className="text-xl text-gray-600">{artist}</p>
            {album && <p className="text-sm text-gray-500 mt-1">{album}</p>}
          </div>
          
          <button
            onClick={handlePlayPause}
            className="flex items-center gap-3 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-full transition-all transform hover:scale-105"
          >
            {isPlaying ? (
              <>
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
                <span>Pause</span>
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Play</span>
              </>
            )}
          </button>
          
          <audio ref={audioRef} className="hidden" />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. CASSETTE TAPE PLAYER
// ==========================================
interface CassetteTapePlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  side?: 'A' | 'B';
}

export function CassetteTapePlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  side = 'A'
}: CassetteTapePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [leftReelRotation, setLeftReelRotation] = useState(0);
  const [rightReelRotation, setRightReelRotation] = useState(0);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: false,
      sources: [{ src: audioSrc, type: 'audio/mp3' }]
    });

    const player = playerRef.current;
    
    player.on('play', () => {
      setIsPlaying(true);
      startReelAnimation();
    });
    
    player.on('pause', () => {
      setIsPlaying(false);
      stopReelAnimation();
    });
    
    player.on('timeupdate', () => {
      const current = player.currentTime() || 0;
      const duration = player.duration() || 1;
      setProgress((current / duration) * 100);
    });

    return () => {
      stopReelAnimation();
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc]);

  const startReelAnimation = () => {
    const animate = () => {
      setLeftReelRotation(prev => prev - 2);
      setRightReelRotation(prev => prev + 2);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
  };

  const stopReelAnimation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const handlePlayPause = () => {
    if (playerRef.current) {
      if (isPlaying) {
        playerRef.current.pause();
      } else {
        playerRef.current.play();
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[400px] bg-gradient-to-br from-purple-900 to-pink-900 p-8 rounded-xl">
      <div className="relative">
        {/* Cassette Body */}
        <div className="relative w-96 h-60 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg shadow-2xl">
          {/* Label Area */}
          <div className="absolute inset-x-8 top-8 bottom-20 bg-gradient-to-br from-yellow-100 to-yellow-200 rounded">
            <div className="relative h-full p-4 flex flex-col justify-between">
              {/* Album Art as Background */}
              <div className="absolute inset-0 opacity-20 rounded overflow-hidden">
                <img src={albumArt} alt={songTitle} className="w-full h-full object-cover" />
              </div>
              
              {/* Text Content */}
              <div className="relative">
                <div className="text-xs text-gray-700 font-bold">SIDE {side}</div>
                <h3 className="text-lg font-bold text-gray-900 mt-1">{songTitle}</h3>
                <p className="text-sm text-gray-700">{artist}</p>
              </div>
              
              {/* Fake Lines */}
              <div className="relative space-y-1">
                <div className="h-0.5 bg-gray-400 w-full"></div>
                <div className="h-0.5 bg-gray-400 w-3/4"></div>
                <div className="h-0.5 bg-gray-400 w-1/2"></div>
              </div>
            </div>
          </div>
          
          {/* Tape Reels */}
          <div className="absolute bottom-4 left-12 right-12 flex justify-between">
            {/* Left Reel */}
            <div className="relative w-16 h-16">
              <div 
                className="absolute inset-0 bg-gray-700 rounded-full"
                style={{ transform: `rotate(${leftReelRotation}deg)` }}
              >
                <div className="absolute inset-2 bg-gray-900 rounded-full"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full"></div>
                {/* Spokes */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="absolute w-full h-0.5 bg-gray-600"></div>
                  <div className="absolute w-full h-0.5 bg-gray-600 rotate-45"></div>
                  <div className="absolute w-full h-0.5 bg-gray-600 rotate-90"></div>
                  <div className="absolute w-full h-0.5 bg-gray-600 -rotate-45"></div>
                </div>
              </div>
            </div>
            
            {/* Right Reel */}
            <div className="relative w-16 h-16">
              <div 
                className="absolute inset-0 bg-gray-700 rounded-full"
                style={{ transform: `rotate(${rightReelRotation}deg)` }}
              >
                <div className="absolute inset-2 bg-gray-900 rounded-full"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full"></div>
                {/* Spokes */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="absolute w-full h-0.5 bg-gray-600"></div>
                  <div className="absolute w-full h-0.5 bg-gray-600 rotate-45"></div>
                  <div className="absolute w-full h-0.5 bg-gray-600 rotate-90"></div>
                  <div className="absolute w-full h-0.5 bg-gray-600 -rotate-45"></div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Window showing tape */}
          <div className="absolute bottom-8 left-20 right-20 h-8 bg-gray-900/50 rounded"></div>
        </div>
        
        {/* Control Buttons */}
        <div className="flex justify-center gap-2 mt-6">
          <button className="p-3 bg-gray-700 hover:bg-gray-600 rounded text-white transition">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>
          <button 
            onClick={handlePlayPause}
            className="p-3 bg-pink-500 hover:bg-pink-600 rounded text-white transition"
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button className="p-3 bg-gray-700 hover:bg-gray-600 rounded text-white transition">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
            </svg>
          </button>
        </div>
        
        <audio ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}

// ==========================================
// 3. CD PLAYER WITH SPINNING DISC
// ==========================================
interface CDPlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  trackNumber?: number;
  totalTracks?: number;
}

export function CDPlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  trackNumber = 1,
  totalTracks = 12
}: CDPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: false,
      sources: [{ src: audioSrc, type: 'audio/mp3' }]
    });

    const player = playerRef.current;
    
    player.on('play', () => {
      setIsPlaying(true);
      startRotation();
    });
    
    player.on('pause', () => {
      setIsPlaying(false);
      stopRotation();
    });
    
    player.on('timeupdate', () => {
      setCurrentTime(player.currentTime() || 0);
      setDuration(player.duration() || 0);
    });

    return () => {
      stopRotation();
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc]);

  const startRotation = () => {
    const animate = () => {
      setRotation(prev => (prev + 3) % 360);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
  };

  const stopRotation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-700 p-8 rounded-xl">
      <div className="bg-black/50 backdrop-blur rounded-lg p-6 max-w-2xl mx-auto">
        {/* Display */}
        <div className="bg-green-950 p-4 rounded mb-6 font-mono text-green-400">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="text-xs opacity-60">TRACK {trackNumber.toString().padStart(2, '0')}/{totalTracks.toString().padStart(2, '0')}</div>
              <div className="text-lg">{songTitle}</div>
              <div className="text-sm opacity-80">{artist}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl">{formatTime(currentTime)}</div>
              <div className="text-xs opacity-60">-{formatTime(duration - currentTime)}</div>
            </div>
          </div>
        </div>
        
        {/* CD Tray */}
        <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-8 shadow-inner">
          {/* CD Disc */}
          <div className="relative mx-auto w-64 h-64">
            <div 
              className="absolute inset-0 rounded-full overflow-hidden shadow-2xl"
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              {/* Outer Ring */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-300 via-pink-300 to-purple-300"></div>
              
              {/* Inner Ring with Holographic Effect */}
              <div className="absolute inset-1 rounded-full bg-gradient-to-br from-cyan-200 via-purple-200 to-pink-200"></div>
              
              {/* Album Art Center */}
              <div className="absolute inset-8 rounded-full overflow-hidden border-2 border-gray-800">
                <img src={albumArt} alt={songTitle} className="w-full h-full object-cover" />
              </div>
              
              {/* Center Hole */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-gray-900 rounded-full"></div>
              
              {/* Rainbow Reflection */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/30 to-transparent mix-blend-overlay"></div>
            </div>
            
            {/* Laser Reader Indicator */}
            {isPlaying && (
              <div className="absolute top-1/2 left-0 w-1/2 h-0.5 bg-red-500 opacity-50 blur-sm animate-pulse"></div>
            )}
          </div>
        </div>
        
        {/* Control Panel */}
        <div className="flex justify-center items-center gap-4 mt-6">
          <button className="p-2 text-gray-400 hover:text-white transition">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>
          
          <button 
            onClick={() => playerRef.current && (isPlaying ? playerRef.current.pause() : playerRef.current.play())}
            className="p-4 bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-full text-white transition shadow-lg"
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
          
          <button className="p-2 text-gray-400 hover:text-white transition">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
            </svg>
          </button>
        </div>
        
        <audio ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}

// ==========================================
// 4. 3D ALBUM COVER WITH PARALLAX
// ==========================================
interface Parallax3DAlbumPlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
  album: string;
}

export function Parallax3DAlbumPlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist,
  album
}: Parallax3DAlbumPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
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

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    
    setMousePosition({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePosition({ x: 0, y: 0 });
  };

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative min-h-[600px] bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-8 rounded-xl overflow-hidden"
    >
      {/* Background Particles */}
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              opacity: Math.random() * 0.5 + 0.2
            }}
          />
        ))}
      </div>
      
      <div className="relative z-10 flex flex-col items-center">
        {/* 3D Album Cover */}
        <div 
          className="relative w-80 h-80 mb-8"
          style={{
            transform: `perspective(1000px) rotateY(${mousePosition.x * 15}deg) rotateX(${-mousePosition.y * 15}deg)`,
            transition: 'transform 0.1s ease-out'
          }}
        >
          {/* Shadow */}
          <div 
            className="absolute inset-0 bg-black/30 blur-2xl transform translate-y-8"
            style={{
              transform: `translateY(${20 - mousePosition.y * 10}px) scaleX(0.9)`
            }}
          />
          
          {/* Album Cover */}
          <div className="relative w-full h-full rounded-lg overflow-hidden shadow-2xl">
            <img 
              src={albumArt} 
              alt={album}
              className="w-full h-full object-cover"
            />
            
            {/* Glossy Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent"></div>
            
            {/* Depth Layers */}
            <div 
              className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"
              style={{
                transform: `translateZ(20px) translateX(${mousePosition.x * 5}px) translateY(${mousePosition.y * 5}px)`
              }}
            />
            
            {/* Album Info Overlay */}
            <div 
              className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent"
              style={{
                transform: `translateZ(40px) translateY(${-mousePosition.y * 3}px)`
              }}
            >
              <h3 className="text-white font-bold text-lg">{album}</h3>
              <p className="text-white/80 text-sm">{artist}</p>
            </div>
          </div>
        </div>
        
        {/* Song Info */}
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-white mb-2">{songTitle}</h2>
          <p className="text-xl text-white/80">{artist}</p>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full max-w-md mb-6">
          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-4">
          <button className="p-3 text-white/60 hover:text-white transition">
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>
          
          <button 
            onClick={() => playerRef.current && (isPlaying ? playerRef.current.pause() : playerRef.current.play())}
            className="p-5 bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-full text-white transition transform hover:scale-110"
          >
            {isPlaying ? (
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          
          <button className="p-3 text-white/60 hover:text-white transition">
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
            </svg>
          </button>
        </div>
        
        <audio ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}

// ==========================================
// 5. POLAROID STACK PLAYER
// ==========================================
interface PolaroidStackPlayerProps {
  tracks: Array<{
    audioSrc: string;
    albumArt: string;
    songTitle: string;
    artist: string;
    date?: string;
  }>;
}

export function PolaroidStackPlayer({ tracks }: PolaroidStackPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stackOrder, setStackOrder] = useState(tracks.map((_, i) => i));

  const currentTrack = tracks[currentTrackIndex];

  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;

    if (playerRef.current) {
      playerRef.current.src({ src: currentTrack.audioSrc, type: 'audio/mp3' });
    } else {
      playerRef.current = videojs(audioRef.current, {
        controls: false,
        sources: [{ src: currentTrack.audioSrc, type: 'audio/mp3' }]
      });

      const player = playerRef.current;
      player.on('play', () => setIsPlaying(true));
      player.on('pause', () => setIsPlaying(false));
      player.on('ended', () => handleNext());
    }

    return () => {
      if (playerRef.current && !audioRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [currentTrack]);

  const handleNext = () => {
    const nextIndex = (currentTrackIndex + 1) % tracks.length;
    setCurrentTrackIndex(nextIndex);
    
    // Animate stack
    setStackOrder(prev => {
      const newOrder = [...prev];
      const first = newOrder.shift();
      if (first !== undefined) newOrder.push(first);
      return newOrder;
    });
    
    setTimeout(() => {
      playerRef.current?.play();
    }, 300);
  };

  const handlePrevious = () => {
    const prevIndex = currentTrackIndex === 0 ? tracks.length - 1 : currentTrackIndex - 1;
    setCurrentTrackIndex(prevIndex);
    
    setStackOrder(prev => {
      const newOrder = [...prev];
      const last = newOrder.pop();
      if (last !== undefined) newOrder.unshift(last);
      return newOrder;
    });
    
    setTimeout(() => {
      playerRef.current?.play();
    }, 300);
  };

  return (
    <div className="min-h-[600px] bg-gradient-to-br from-amber-100 to-orange-100 p-8 rounded-xl flex items-center justify-center">
      <div className="relative w-96 h-96">
        {/* Polaroid Stack */}
        {tracks.map((track, index) => {
          const stackPosition = stackOrder.indexOf(index);
          const isTop = stackPosition === 0;
          
          return (
            <div
              key={index}
              className={`absolute inset-0 transition-all duration-500 ${
                isTop ? 'z-30' : 'z-' + (20 - stackPosition)
              }`}
              style={{
                transform: `
                  rotate(${isTop ? 0 : (stackPosition - 2) * 5}deg)
                  translateY(${isTop ? 0 : stackPosition * 2}px)
                  scale(${isTop ? 1 : 0.95 - stackPosition * 0.02})
                `,
                opacity: stackPosition < 4 ? 1 : 0
              }}
            >
              {/* Polaroid Frame */}
              <div className="bg-white p-4 pb-16 rounded shadow-xl">
                {/* Photo */}
                <div className="w-full h-80 bg-gray-200 overflow-hidden">
                  <img 
                    src={track.albumArt} 
                    alt={track.songTitle}
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Text Area */}
                <div className="mt-4 text-center">
                  <p className="font-marker text-gray-800">{track.songTitle}</p>
                  <p className="text-sm text-gray-600">{track.artist}</p>
                  {track.date && (
                    <p className="text-xs text-gray-500 mt-1">{track.date}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Controls */}
        <div className="absolute -bottom-20 left-1/2 transform -translate-x-1/2 flex items-center gap-4 z-40">
          <button
            onClick={handlePrevious}
            className="p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>
          
          <button
            onClick={() => playerRef.current && (isPlaying ? playerRef.current.pause() : playerRef.current.play())}
            className="p-4 bg-orange-500 text-white rounded-full shadow-lg hover:shadow-xl transition"
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
          
          <button
            onClick={handleNext}
            className="p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
            </svg>
          </button>
        </div>
        
        <audio ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}

// ==========================================
// 6. ANIMATED WAVEFORM ALBUM ART
// ==========================================
interface WaveformAlbumPlayerProps {
  audioSrc: string;
  albumArt: string;
  songTitle: string;
  artist: string;
}

export function WaveformAlbumPlayer({
  audioSrc,
  albumArt,
  songTitle,
  artist
}: WaveformAlbumPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: false,
      sources: [{ src: audioSrc, type: 'audio/mp3' }]
    });

    const player = playerRef.current;

    const setupAudioVisualization = () => {
      if (audioContextRef.current) return;

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      const source = audioContextRef.current.createMediaElementSource(audioRef.current!);
      source.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);

      drawVisualization();
    };

    player.on('play', () => {
      setIsPlaying(true);
      setupAudioVisualization();
    });

    player.on('pause', () => {
      setIsPlaying(false);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    });

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc]);

  const drawVisualization = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d')!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Clear canvas with slight trail effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw circular waveform around album
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 120;

      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        const height = percent * 80;
        const angle = (i / bufferLength) * Math.PI * 2;

        const x1 = centerX + Math.cos(angle) * (radius + 10);
        const y1 = centerY + Math.sin(angle) * (radius + 10);
        const x2 = centerX + Math.cos(angle) * (radius + height);
        const y2 = centerY + Math.sin(angle) * (radius + height);

        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, `hsl(${(i / bufferLength) * 360}, 100%, 50%)`);
        gradient.addColorStop(1, `hsl(${(i / bufferLength) * 360}, 100%, 70%)`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    };

    draw();
  };

  return (
    <div className="relative min-h-[600px] bg-black p-8 rounded-xl overflow-hidden">
      {/* Canvas for visualization */}
      <canvas
        ref={canvasRef}
        width={600}
        height={600}
        className="absolute inset-0 w-full h-full"
      />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[550px]">
        {/* Album Art in Center */}
        <div className="relative w-48 h-48 rounded-full overflow-hidden shadow-2xl mb-8">
          <img 
            src={albumArt} 
            alt={songTitle}
            className="w-full h-full object-cover"
          />
          
          {/* Pulse Effect when playing */}
          {isPlaying && (
            <div className="absolute inset-0 rounded-full bg-white/20 animate-ping"></div>
          )}
        </div>
        
        {/* Song Info */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">{songTitle}</h2>
          <p className="text-lg text-gray-300">{artist}</p>
        </div>
        
        {/* Controls */}
        <button
          onClick={() => playerRef.current && (isPlaying ? playerRef.current.pause() : playerRef.current.play())}
          className="p-4 bg-white/10 backdrop-blur hover:bg-white/20 rounded-full text-white transition"
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
        
        <audio ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}