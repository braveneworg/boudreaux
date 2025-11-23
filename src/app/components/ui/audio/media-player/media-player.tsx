'use client';

import type React from 'react';

const Viewer = () => <div>Viewer</div>;

const Controls = () => <div>Controls</div>;

const CarouselFourUp = () => <div>CarouselFourUp</div>;

const Description = () => <div>Description</div>;

const Drawer = () => <div>Drawer</div>;

const InfoTickerTape = () => <div>InfoTickerTape</div>;

const SocialShareBar = () => <div>SocialShareBar</div>;

type MediaPlayerComponent =
  | typeof Viewer
  | typeof Controls
  | typeof CarouselFourUp
  | typeof Description
  | typeof Drawer
  | typeof InfoTickerTape
  | typeof SocialShareBar;

type MediaPlayerChildren = React.ReactElement<Record<string, never>, MediaPlayerComponent>;

interface MediaPlayerProps {
  children: MediaPlayerChildren | MediaPlayerChildren[];
  artists?: Artist[];
}

export const MediaPlayer = ({ artists, children }: MediaPlayerProps) => <div>{children}</div>;

MediaPlayer.Viewer = Viewer;
MediaPlayer.Controls = Controls;
MediaPlayer.CarouselFourUp = CarouselFourUp;
MediaPlayer.Description = Description;
MediaPlayer.Drawer = Drawer;
MediaPlayer.InfoTickerTape = InfoTickerTape;
MediaPlayer.SocialShareBar = SocialShareBar;
