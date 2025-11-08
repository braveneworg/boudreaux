import { render, screen } from '@testing-library/react';

import Home from './page';

// Mock the audio player component
vi.mock('./components/ui/audio/mobile-first-players', () => ({
  MobileCardPlayer: ({
    audioSrc,
    albumArt,
    album,
    songTitle,
    artist,
  }: {
    audioSrc: string;
    albumArt: string;
    album: string;
    songTitle: string;
    artist: string;
  }) => (
    <div data-testid="mobile-card-player">
      <div data-testid="song-title">{songTitle}</div>
      <div data-testid="artist">{artist}</div>
      <div data-testid="album">{album}</div>
      <div data-testid="album-art" style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={albumArt} alt={album} />
      </div>
      <audio src={audioSrc} data-testid="audio-element" />
    </div>
  ),
}));

// Mock UI components
vi.mock('./components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="card">
      {children}
    </div>
  ),
}));

vi.mock('./components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('./components/ui/page-container', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...props} />;
  },
}));

describe('Home Page', () => {
  it('should render page structure', () => {
    render(<Home />);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });

  it('should render featured artists heading', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: 'Featured artists' })).toBeInTheDocument();
  });

  it('should render mobile card player', () => {
    render(<Home />);

    expect(screen.getByTestId('mobile-card-player')).toBeInTheDocument();
  });

  it('should display correct track information', () => {
    render(<Home />);

    expect(screen.getByTestId('song-title')).toHaveTextContent('We Are Enough');
    expect(screen.getByTestId('artist')).toHaveTextContent('Ceschi');
    expect(screen.getByTestId('album')).toHaveTextContent(
      'Bring Us The Head Of Francisco False (Part 1): The Day You Realize That You Mean Nothing is Everything.'
    );
  });

  it('should render album art', () => {
    render(<Home />);

    const albumArtContainer = screen.getByTestId('album-art');
    expect(albumArtContainer).toBeInTheDocument();
    const albumArt = albumArtContainer.querySelector('img') as HTMLImageElement;
    expect(albumArt).toBeInTheDocument();
    expect(albumArt.src).toContain('/media/ceschi/we-are-enough.jpg');
  });

  it('should render audio element with correct source', () => {
    render(<Home />);

    const audioElement = screen.getByTestId('audio-element') as HTMLAudioElement;
    expect(audioElement).toBeInTheDocument();
    expect(audioElement.src).toContain(
      '/media/ceschi/mp3s/Ceschi%20-%20Bring%20Us%20The%20Head%20Of%20Francisco%20False%20(Part%201)%20-%2003%20We%20Are%20Enough%20(produced%20by%20Danny%20T%20Levin).mp3'
    );
  });

  it('should apply correct CSS class to card', () => {
    render(<Home />);

    expect(screen.getByTestId('card')).toHaveClass('mb-6');
  });
});
