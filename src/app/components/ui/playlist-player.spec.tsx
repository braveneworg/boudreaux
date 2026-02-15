/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PlaylistPlayer } from './playlist-player';

// Mock the AudioPlayer component
vi.mock('./audio-player', () => ({
  AudioPlayer: vi.fn(
    ({ src, onReady }: { src: string; poster?: string; onReady?: (player: unknown) => void }) => {
      // Simulate calling onReady with a mock player
      if (onReady) {
        const mockPlayer = {
          on: vi.fn(),
        };
        setTimeout(() => onReady(mockPlayer), 0);
      }
      return <div data-testid="audio-player">Audio: {src}</div>;
    }
  ),
}));

const mockTracks = [
  {
    id: '1',
    title: 'Track One',
    artist: 'Artist A',
    src: '/audio/track1.mp3',
    poster: '/images/track1.jpg',
  },
  {
    id: '2',
    title: 'Track Two',
    artist: 'Artist B',
    src: '/audio/track2.mp3',
  },
  {
    id: '3',
    title: 'Track Three',
    artist: 'Artist C',
    src: '/audio/track3.mp3',
  },
];

describe('PlaylistPlayer', () => {
  it('renders "No tracks available" when tracks array is empty', () => {
    render(<PlaylistPlayer tracks={[]} />);

    expect(screen.getByText('No tracks available')).toBeInTheDocument();
  });

  it('renders first track title as heading', () => {
    render(<PlaylistPlayer tracks={mockTracks} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Track One' })).toBeInTheDocument();
  });

  it('renders first track artist', () => {
    render(<PlaylistPlayer tracks={mockTracks} />);

    // The artist appears in the main display and in the playlist
    const artistElements = screen.getAllByText('Artist A');
    expect(artistElements.length).toBeGreaterThan(0);
  });

  it('renders AudioPlayer with first track source', () => {
    render(<PlaylistPlayer tracks={mockTracks} />);

    expect(screen.getByTestId('audio-player')).toHaveTextContent('Audio: /audio/track1.mp3');
  });

  it('renders Playlist heading', () => {
    render(<PlaylistPlayer tracks={mockTracks} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Playlist' })).toBeInTheDocument();
  });

  it('renders all tracks in playlist', () => {
    render(<PlaylistPlayer tracks={mockTracks} />);

    // Track titles appear in both the header and playlist
    const trackOneElements = screen.getAllByText('Track One');
    const trackTwoElements = screen.getAllByText('Track Two');
    const trackThreeElements = screen.getAllByText('Track Three');

    // Each track should appear at least once
    expect(trackOneElements.length).toBeGreaterThanOrEqual(1);
    expect(trackTwoElements.length).toBeGreaterThanOrEqual(1);
    expect(trackThreeElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders track artists in playlist', () => {
    render(<PlaylistPlayer tracks={mockTracks} />);

    expect(screen.getByText('Artist B')).toBeInTheDocument();
    expect(screen.getByText('Artist C')).toBeInTheDocument();
  });

  it('highlights current track in playlist', () => {
    render(<PlaylistPlayer tracks={mockTracks} />);

    // The current track should have special styling
    const trackItems = screen.getAllByRole('listitem');
    expect(trackItems[0]).toHaveClass('bg-blue-100');
    expect(trackItems[0]).toHaveClass('border-l-4');
    expect(trackItems[0]).toHaveClass('border-blue-500');
  });

  it('non-current tracks have default styling', () => {
    render(<PlaylistPlayer tracks={mockTracks} />);

    const trackItems = screen.getAllByRole('listitem');
    expect(trackItems[1]).toHaveClass('bg-gray-50');
    expect(trackItems[2]).toHaveClass('bg-gray-50');
  });

  it('changes track when playlist item is clicked', async () => {
    const user = userEvent.setup();

    render(<PlaylistPlayer tracks={mockTracks} />);

    // Click on the second track
    const trackItems = screen.getAllByRole('listitem');
    await user.click(trackItems[1]);

    // Now the second track should be current
    expect(screen.getByRole('heading', { level: 2, name: 'Track Two' })).toBeInTheDocument();
    expect(screen.getByTestId('audio-player')).toHaveTextContent('Audio: /audio/track2.mp3');
  });

  it('updates highlighted track after clicking', async () => {
    const user = userEvent.setup();

    render(<PlaylistPlayer tracks={mockTracks} />);

    // Click on the third track
    const trackItems = screen.getAllByRole('listitem');
    await user.click(trackItems[2]);

    // The third track should now be highlighted
    const updatedTrackItems = screen.getAllByRole('listitem');
    expect(updatedTrackItems[2]).toHaveClass('bg-blue-100');
    expect(updatedTrackItems[0]).toHaveClass('bg-gray-50');
  });

  it('renders with cursor-pointer for clickable tracks', () => {
    render(<PlaylistPlayer tracks={mockTracks} />);

    const trackItems = screen.getAllByRole('listitem');
    trackItems.forEach((item) => {
      expect(item).toHaveClass('cursor-pointer');
    });
  });

  it('renders container with max-w-2xl class', () => {
    render(<PlaylistPlayer tracks={mockTracks} />);

    // The outer container should have max-width
    const container = screen.getByRole('heading', { level: 2 }).parentElement?.parentElement;
    expect(container).toHaveClass('max-w-2xl');
  });
});
