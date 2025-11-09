declare module 'react-video-js-player' {
  import { Component } from 'react';

  export interface VideoJsPlayer {
    play: () => void;
    pause: () => void;
    currentTime: (time?: number) => number;
    duration: () => number;
    volume: (level?: number) => number;
    muted: (muted?: boolean) => boolean;
    dispose: () => void;
    [key: string]: unknown;
  }

  export interface VideoSource {
    src: string;
    type: string;
  }

  export interface VideoJsPlayerOptions {
    src?: string;
    sources?: VideoSource[];
    poster?: string;
    controls?: boolean;
    autoplay?: boolean;
    preload?: 'auto' | 'metadata' | 'none';
    width?: string | number;
    height?: string | number;
    bigPlayButton?: boolean;
    bigPlayButtonCentered?: boolean;
    controlBar?: {
      volumePanel?: {
        inline?: boolean;
      };
    };
    className?: string;
    hideControls?: string[];
    onReady?: (player: VideoJsPlayer) => void;
    onPlay?: (duration: number) => void;
    onPause?: (duration: number) => void;
    onTimeUpdate?: (duration: number) => void;
    onSeeking?: (duration: number) => void;
    onSeeked?: (src: string, duration: number) => void;
    onEnd?: () => void;
    onError?: (error: Error | MediaError) => void;
    onLoadedData?: () => void;
    onCanPlay?: () => void;
    onCanPlayThrough?: () => void;
    playbackRates?: number[];
    hidePlaybackRates?: boolean;
    muted?: boolean;
    loop?: boolean;
    fluid?: boolean;
    responsive?: boolean;
    fill?: boolean;
  }

  export interface VideoJsProps {
    options: VideoJsPlayerOptions;
  }

  export default class VideoPlayer extends Component<VideoJsProps> {}
}
