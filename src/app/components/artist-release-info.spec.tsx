/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen } from '@testing-library/react';

import type { FeaturedArtist } from '@/lib/types/media-models';

import { ArtistReleaseInfo } from './artist-release-info';

const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('lucide-react', () => ({
  Share2Icon: (props: React.HTMLAttributes<HTMLSpanElement>) => (
    <span data-testid="share2-icon" onClick={props.onClick} />
  ),
}));

vi.mock('sonner', () => ({
  toast: mockToast,
}));

vi.mock('./social-share-widget', () => ({
  SocialShareWidget: () => <div data-testid="social-share-widget" />,
}));

vi.mock('@/lib/utils/get-display-name', () => ({
  getDisplayName: (item: Record<string, unknown>) =>
    (item.displayName as string) || 'Mock Display Name',
}));

describe('ArtistReleaseInfo', () => {
  it('should render the artist name in a screen-reader-only heading', () => {
    render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Test Artist');
    expect(heading).toHaveClass('sr-only');
  });

  it('should set the correct aria-label on the heading', () => {
    render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('aria-label', 'Now playing: Test Artist - Test Album');
  });

  it('should render the release title in italics', () => {
    render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" />);

    const em = screen.getByText('Test Album');
    expect(em.tagName).toBe('EM');
  });

  it('should render a separator', () => {
    const { container } = render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" />);

    const separator = container.querySelector('[data-slot="separator"]');
    expect(separator).toBeInTheDocument();
  });

  it('should handle empty title', () => {
    render(<ArtistReleaseInfo artistName="Test Artist" title="" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('aria-label', 'Now playing: Test Artist - ');
  });

  it('should handle empty artist name', () => {
    render(<ArtistReleaseInfo artistName="" title="Test Album" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('aria-label', 'Now playing:  - Test Album');
  });

  it('should render inside an article element', () => {
    const { container } = render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" />);

    const article = container.querySelector('article');
    expect(article).toBeInTheDocument();
  });

  it('should render both artist name and title with special characters', () => {
    render(<ArtistReleaseInfo artistName="Beyoncé" title="4 (Deluxe)" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('aria-label', 'Now playing: Beyoncé - 4 (Deluxe)');
    expect(screen.getByText('4 (Deluxe)')).toBeInTheDocument();
  });

  it('should render a visible heading when visibleHeading is true', () => {
    render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" visibleHeading />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Test Artist');
    expect(heading).not.toHaveClass('sr-only');
    expect(heading).toHaveClass('text-sm', 'font-bold', 'text-shadow-accent');
  });

  describe('share functionality', () => {
    const mockFeaturedArtists = [
      { displayName: 'Artist One' },
      { displayName: 'Artist Two', artists: [{ slug: 'artist-two' }] },
    ] as unknown as FeaturedArtist[];

    const mockSelectedArtist = {
      displayName: 'Selected Artist',
      artists: [{ slug: 'selected-artist' }],
      release: { title: 'Selected Release' },
    } as unknown as FeaturedArtist;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should render the Share2Icon', () => {
      render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" />);

      expect(screen.getByTestId('share2-icon')).toBeInTheDocument();
    });

    it('should render the SocialShareWidget', () => {
      render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" />);

      expect(screen.getByTestId('social-share-widget')).toBeInTheDocument();
    });

    it('should call setSelectedArtist with the second featured artist when no selectedArtist', () => {
      const setSelectedArtist = vi.fn();

      render(
        <ArtistReleaseInfo
          artistName="Test Artist"
          title="Test Album"
          featuredArtists={mockFeaturedArtists}
          setSelectedArtist={setSelectedArtist}
        />
      );

      fireEvent.click(screen.getByTestId('share2-icon'));

      expect(setSelectedArtist).toHaveBeenCalledWith(mockFeaturedArtists[1]);
    });

    it('should not call setSelectedArtist when no selectedArtist and no featured artists', () => {
      const setSelectedArtist = vi.fn();

      render(
        <ArtistReleaseInfo
          artistName="Test Artist"
          title="Test Album"
          featuredArtists={[]}
          setSelectedArtist={setSelectedArtist}
        />
      );

      fireEvent.click(screen.getByTestId('share2-icon'));

      expect(setSelectedArtist).not.toHaveBeenCalled();
    });

    it('should use navigator.share when available and selectedArtist has a slug', async () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'share', {
        value: mockShare,
        writable: true,
        configurable: true,
      });

      render(
        <ArtistReleaseInfo
          artistName="Test Artist"
          title="Test Album"
          selectedArtist={mockSelectedArtist}
          featuredArtists={mockFeaturedArtists}
        />
      );

      fireEvent.click(screen.getByTestId('share2-icon'));

      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Selected Release',
          text: 'Check out Selected Artist on Fake Four Inc.!',
          url: expect.stringContaining('/artists/selected-artist'),
        })
      );
    });

    it('should fall back to clipboard.writeText when navigator.share is not available', async () => {
      Object.defineProperty(navigator, 'share', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });

      render(
        <ArtistReleaseInfo
          artistName="Test Artist"
          title="Test Album"
          selectedArtist={mockSelectedArtist}
          featuredArtists={mockFeaturedArtists}
        />
      );

      fireEvent.click(screen.getByTestId('share2-icon'));

      expect(mockWriteText).toHaveBeenCalledWith(
        expect.stringContaining('/artists/selected-artist')
      );
    });

    it('should show success toast when share succeeds', async () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'share', {
        value: mockShare,
        writable: true,
        configurable: true,
      });

      render(
        <ArtistReleaseInfo
          artistName="Test Artist"
          title="Test Album"
          selectedArtist={mockSelectedArtist}
          featuredArtists={mockFeaturedArtists}
        />
      );

      fireEvent.click(screen.getByTestId('share2-icon'));

      await vi.waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Content shared successfully!');
      });
    });

    it('should show error toast when share fails', async () => {
      const shareError = new Error('Share failed');
      const mockShare = vi.fn().mockRejectedValue(shareError);
      Object.defineProperty(navigator, 'share', {
        value: mockShare,
        writable: true,
        configurable: true,
      });

      render(
        <ArtistReleaseInfo
          artistName="Test Artist"
          title="Test Album"
          selectedArtist={mockSelectedArtist}
          featuredArtists={mockFeaturedArtists}
        />
      );

      fireEvent.click(screen.getByTestId('share2-icon'));

      await vi.waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Error sharing content');
      });
    });

    it('should not show error toast when user cancels the share dialog', async () => {
      const abortError = new DOMException('Share canceled', 'AbortError');
      const mockShare = vi.fn().mockRejectedValue(abortError);
      Object.defineProperty(navigator, 'share', {
        value: mockShare,
        writable: true,
        configurable: true,
      });

      render(
        <ArtistReleaseInfo
          artistName="Test Artist"
          title="Test Album"
          selectedArtist={mockSelectedArtist}
          featuredArtists={mockFeaturedArtists}
        />
      );

      fireEvent.click(screen.getByTestId('share2-icon'));

      // Give the promise time to settle
      await vi.waitFor(() => {
        expect(mockShare).toHaveBeenCalled();
      });

      expect(mockToast.error).not.toHaveBeenCalled();
    });
  });
});
