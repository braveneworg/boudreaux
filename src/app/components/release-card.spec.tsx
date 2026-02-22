/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import { ReleaseCard } from './release-card';

// Mock next/image
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string;
    alt: string;
    loading?: string;
    className?: string;
  }) => <span data-testid="release-cover-image" data-src={src} data-alt={alt} {...props} />,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    target?: string;
    rel?: string;
  }) => (
    <a href={href} data-testid="mock-link" {...props}>
      {children}
    </a>
  ),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Music2: ({ className }: { className?: string }) => (
    <span data-testid="music2-icon" className={className} />
  ),
}));

describe('ReleaseCard', () => {
  const defaultProps = {
    id: 'release-1',
    title: 'Midnight Serenade',
    artistName: 'John Doe',
    coverArt: {
      src: 'https://cdn.example.com/cover.jpg',
      alt: 'Midnight Serenade cover art',
    },
    bandcampUrl: 'https://label.bandcamp.com/album/midnight',
  };

  it('should render cover art image', () => {
    render(<ReleaseCard {...defaultProps} />);

    const image = screen.getByTestId('release-cover-image');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('data-src', defaultProps.coverArt.src);
    expect(image).toHaveAttribute('data-alt', defaultProps.coverArt.alt);
  });

  it('should render artist name', () => {
    render(<ReleaseCard {...defaultProps} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should render release title', () => {
    render(<ReleaseCard {...defaultProps} />);

    expect(screen.getByText('Midnight Serenade')).toBeInTheDocument();
  });

  it('should render Bandcamp link with new tab and noopener noreferrer', () => {
    render(<ReleaseCard {...defaultProps} />);

    const links = screen.getAllByTestId('mock-link');
    const bandcampLink = links.find(
      (link) => link.getAttribute('href') === defaultProps.bandcampUrl
    );
    expect(bandcampLink).toBeInTheDocument();
    expect(bandcampLink).toHaveAttribute('target', '_blank');
    expect(bandcampLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('should not render Bandcamp link when bandcampUrl is null', () => {
    render(<ReleaseCard {...defaultProps} bandcampUrl={null} />);

    const links = screen.queryAllByTestId('mock-link');
    const bandcampLink = links.find((link) => link.getAttribute('target') === '_blank');
    expect(bandcampLink).toBeUndefined();
  });

  it('should render Play button with Music2 icon', () => {
    render(<ReleaseCard {...defaultProps} />);

    const playButton = screen.getByRole('link', { name: /play midnight serenade/i });
    expect(playButton).toBeInTheDocument();
    expect(screen.getByTestId('music2-icon')).toBeInTheDocument();
  });

  it('should link Play button to /releases/{releaseId}?autoplay=true', () => {
    render(<ReleaseCard {...defaultProps} />);

    const playLink = screen.getByRole('link', { name: /play midnight serenade/i });
    expect(playLink).toHaveAttribute('href', '/releases/release-1?autoplay=true');
  });

  it('should render styled placeholder when coverArt is null', () => {
    render(<ReleaseCard {...defaultProps} coverArt={null} />);

    expect(screen.queryByTestId('release-cover-image')).not.toBeInTheDocument();
    // Placeholder should show title and artist name
    const placeholder = screen.getByTestId('cover-art-placeholder');
    expect(placeholder).toBeInTheDocument();
  });

  it('should have aria-label on Play button', () => {
    render(<ReleaseCard {...defaultProps} />);

    const playButton = screen.getByRole('link', { name: /play midnight serenade/i });
    expect(playButton).toHaveAttribute('aria-label', 'Play Midnight Serenade');
  });
});
