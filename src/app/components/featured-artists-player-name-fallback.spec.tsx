/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import type { FeaturedArtist } from '@/lib/types/media-models';

import { FeaturedArtistsPlayer } from './featured-artists-player';

// Predictable CDN URLs so the audio controls render.
vi.mock('@/lib/utils/cdn-url', () => ({
  buildCdnUrl: (s3Key: string) => `https://cdn.example.com/${s3Key}`,
  resolveStreamUrl: (file: { s3Key?: string | null; streamUrl?: string | null }) =>
    file.streamUrl ?? (file.s3Key ? `https://cdn.example.com/${file.s3Key}` : null),
}));

// Force the display-name helper to resolve to `undefined`. `undefined !== null`,
// so the artist stays displayable/selectable, yet every JSX call site evaluates
// the `getFeaturedArtistDisplayName(selectedArtist) ?? ''` fallback to ''.
vi.mock('@/lib/utils/get-featured-artist-display-name', () => ({
  getFeaturedArtistDisplayName: () => undefined,
}));

// Minimal MediaPlayer mock surfacing the artist-name props that flow through
// the `?? ''` fallbacks.
vi.mock('@/app/components/ui/audio/media-player', () => {
  const MockMediaPlayer = ({ children }: { children: ReactNode }) => (
    <div data-testid="media-player">{children}</div>
  );
  MockMediaPlayer.displayName = 'MockMediaPlayer';

  MockMediaPlayer.FeaturedArtistCarousel = () => null;

  MockMediaPlayer.InteractiveCoverArt = ({ alt }: { alt: string }) => (
    <span data-testid="cover-art-image" data-alt={alt} />
  );

  MockMediaPlayer.Controls = ({ audioSrc }: { audioSrc: string }) => (
    <div data-testid="media-controls" data-audio-src={audioSrc} />
  );

  MockMediaPlayer.InfoTickerTape = ({ trackTitle }: { trackTitle?: string }) => (
    <div data-testid="info-ticker-tape">{trackTitle}</div>
  );

  MockMediaPlayer.FormatFileListDrawer = ({
    artistName,
    downloadTrigger,
  }: {
    artistName: string;
    downloadTrigger?: ReactNode;
  }) => (
    <div data-testid="format-file-list-drawer" data-artist-name={artistName}>
      {downloadTrigger}
    </div>
  );

  return { MediaPlayer: MockMediaPlayer };
});

vi.mock('./deferred-download-dialog', () => ({
  DeferredDownloadDialog: ({ artistName }: { artistName: string }) => (
    <span data-testid="deferred-download" data-artist-name={artistName} />
  ),
}));

vi.mock('./release-share-widget', () => ({
  ReleaseShareWidget: () => <div data-testid="share-widget" />,
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="cover-art-image" data-src={src} data-alt={alt} />
  ),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
};

const files = [
  {
    id: 'file-1',
    trackNumber: 1,
    title: 'First Track',
    fileName: '01-first-track.mp3',
    s3Key: 'audio/track-1.mp3',
    formatId: 'format-1',
  },
];

const digitalFormat = { id: 'format-1', files };
const release = { id: 'release-1', title: 'Test Album', coverArt: null, images: [] };

const artist = {
  id: 'artist-1',
  displayName: 'Resolved Elsewhere',
  coverArt: 'https://example.com/cover.jpg',
  digitalFormat,
  release,
  artists: [],
} as unknown as FeaturedArtist;

describe('FeaturedArtistsPlayer display-name fallback', () => {
  // With the helper resolving to undefined, the selected artist renders through
  // every `getFeaturedArtistDisplayName(selectedArtist) ?? ''` fallback.
  it('falls back to an empty artist name in the format file drawer', () => {
    render(<FeaturedArtistsPlayer featuredArtists={[artist]} />, { wrapper: createWrapper() });

    expect(screen.getByTestId('format-file-list-drawer')).toHaveAttribute('data-artist-name', '');
  });

  it('falls back to an empty artist name in the deferred download trigger', () => {
    render(<FeaturedArtistsPlayer featuredArtists={[artist]} />, { wrapper: createWrapper() });

    expect(screen.getByTestId('deferred-download')).toHaveAttribute('data-artist-name', '');
  });

  it('falls back to an empty alt on the interactive cover art', () => {
    render(<FeaturedArtistsPlayer featuredArtists={[artist]} />, { wrapper: createWrapper() });

    const covers = screen.getAllByTestId('cover-art-image');
    expect(covers.some((node) => node.getAttribute('data-alt') === '')).toBe(true);
  });
});
