'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Pause, Play } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { cn } from '@/lib/utils';

interface TrackPlayButtonProps {
  /** The audio source URL */
  audioUrl: string;
  /** Optional className for styling */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'default' | 'lg' | 'icon';
  /** Whether to show as icon only */
  iconOnly?: boolean;
}

/**
 * A simple play/pause button for previewing track audio.
 * Only one instance can play at a time - starting playback on one will stop others.
 */
export function TrackPlayButton({
  audioUrl,
  className,
  size = 'icon',
  iconOnly = true,
}: TrackPlayButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Create audio element on mount
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audioRef.current = audio;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleError = (e: Event) => {
      console.error('Audio error:', e);
      setIsPlaying(false);
      setIsLoading(false);
    };
    const handleCanPlay = () => setIsLoading(false);
    const handleLoadStart = () => setIsLoading(true);

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('loadstart', handleLoadStart);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Update audio source when URL changes
  useEffect(() => {
    if (audioRef.current && audioUrl && currentUrlRef.current !== audioUrl) {
      audioRef.current.pause();
      currentUrlRef.current = audioUrl;
      setIsPlaying(false);
    }
  }, [audioUrl]);

  // Listen for other TrackPlayButtons starting playback
  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const customEvent = e as CustomEvent<{ audioElement: HTMLAudioElement }>;
      if (audioRef.current && customEvent.detail.audioElement !== audioRef.current) {
        audioRef.current.pause();
      }
    };

    window.addEventListener('track-play-button:play', handleOtherPlay);
    return () => {
      window.removeEventListener('track-play-button:play', handleOtherPlay);
    };
  }, []);

  const togglePlayback = useCallback(async () => {
    if (!audioRef.current || !audioUrl) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        // Notify other buttons to stop
        window.dispatchEvent(
          new CustomEvent('track-play-button:play', {
            detail: { audioElement: audioRef.current },
          })
        );

        // Always set the source to ensure it's correct
        audioRef.current.src = audioUrl;
        currentUrlRef.current = audioUrl;

        await audioRef.current.play();
      }
    } catch (err) {
      console.error('Playback error:', err);
      setIsPlaying(false);
    }
  }, [audioUrl, isPlaying]);

  if (!audioUrl || audioUrl.startsWith('pending://')) {
    return null;
  }

  const iconSize = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';

  return (
    <Button
      variant="outline"
      size={size}
      className={cn(
        'shrink-0 border-2 border-zinc-900 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800',
        className
      )}
      onClick={togglePlayback}
      disabled={isLoading}
      title={isPlaying ? 'Pause' : 'Play'}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      type="button"
    >
      {isPlaying ? <Pause className={iconSize} /> : <Play className={iconSize} />}
      <span className="sr-only">{isPlaying ? 'Pause' : 'Play'}</span>
    </Button>
  );
}
