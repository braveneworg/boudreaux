/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fireEvent, render, screen } from '@testing-library/react';

import { ReleaseCard } from './release-card';

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

// Mock the cover modal — its behavior is covered by release-cover-modal.spec.
// Here we only assert ReleaseCard delegates the right props to it.
vi.mock('./release-cover-modal', () => ({
  ReleaseCoverModal: ({
    id,
    title,
    artistName,
    coverArt,
    releasedOn,
  }: {
    id: string;
    title: string;
    artistName: string | null;
    coverArt: { src: string; alt: string } | null;
    releasedOn: Date;
  }) => (
    <div
      data-testid="release-cover-modal"
      data-id={id}
      data-title={title}
      data-artist={artistName ?? ''}
      data-cover-src={coverArt?.src ?? ''}
      data-released-on={releasedOn.toISOString()}
    />
  ),
}));

// Mock DeferredDownloadDialog so the test does not pull in the deferred dialog tree
vi.mock('./deferred-download-dialog', () => ({
  DeferredDownloadDialog: ({
    artistName,
    releaseId,
    releaseTitle,
    triggerClassName,
  }: {
    artistName: string;
    releaseId: string;
    releaseTitle: string;
    triggerClassName?: string;
  }) => (
    <button
      type="button"
      data-testid="deferred-download-dialog"
      data-artist={artistName}
      data-release-id={releaseId}
      data-release-title={releaseTitle}
      className={triggerClassName}
    >
      Download
    </button>
  ),
}));

// Spy on the audio priming hook — the card must source-prime INSIDE the Play
// click gesture (see usePrimedAudioHandoff); the hook itself has its own spec.
const primeMediaEl = vi.fn();
const takeMediaEl = vi.fn((): HTMLAudioElement | null => null);
const discardMediaEl = vi.fn();
vi.mock('@/hooks/use-primed-audio-handoff', () => ({
  usePrimedAudioHandoff: () => ({ primeMediaEl, takeMediaEl, discardMediaEl }),
}));

// Stub the play dialog — covered by release-play-dialog.spec. The stub echoes
// the wiring props and exposes a close trigger for the discard-on-close test.
vi.mock('./release-play-dialog', () => ({
  ReleasePlayDialog: ({
    releaseId,
    title,
    artistName,
    open,
    onOpenChange,
    takeMediaEl: dialogTakeMediaEl,
    prefetch,
  }: {
    releaseId: string;
    title: string;
    artistName: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    takeMediaEl: () => HTMLAudioElement | null;
    prefetch?: boolean;
  }) => (
    <div
      data-testid="release-play-dialog"
      data-release-id={releaseId}
      data-title={title}
      data-artist={artistName ?? ''}
      data-open={open.toString()}
      data-prefetch={(prefetch ?? false).toString()}
      data-has-take-media-el={(dialogTakeMediaEl !== undefined).toString()}
    >
      <button type="button" data-testid="close-play-dialog" onClick={() => onOpenChange(false)}>
        Close
      </button>
    </div>
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
    releasedOn: new Date(2024, 0, 2),
    bandcampUrl: 'https://label.bandcamp.com/album/midnight',
    playSrc: 'https://cdn.example.com/releases/release-1/tracks/01.mp3',
  };

  it('should delegate cover art to ReleaseCoverModal with the release details', () => {
    render(<ReleaseCard {...defaultProps} />);

    const modal = screen.getByTestId('release-cover-modal');
    expect(modal).toHaveAttribute('data-id', 'release-1');
    expect(modal).toHaveAttribute('data-title', 'Midnight Serenade');
    expect(modal).toHaveAttribute('data-artist', 'John Doe');
    expect(modal).toHaveAttribute('data-cover-src', defaultProps.coverArt.src);
    expect(modal).toHaveAttribute('data-released-on', defaultProps.releasedOn.toISOString());
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

    const playButton = screen.getByRole('button', { name: /play midnight serenade/i });
    expect(playButton).toBeInTheDocument();
    expect(screen.getByTestId('music2-icon')).toBeInTheDocument();
  });

  it('primes the first track and opens the play modal inside the Play click', () => {
    render(<ReleaseCard {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /play midnight serenade/i }));

    expect(primeMediaEl).toHaveBeenCalledWith(defaultProps.playSrc);
    expect(screen.getByTestId('release-play-dialog')).toHaveAttribute('data-open', 'true');
  });

  it('wires the play dialog to this release and the primed element supplier', () => {
    render(<ReleaseCard {...defaultProps} />);

    const dialog = screen.getByTestId('release-play-dialog');
    expect(dialog).toHaveAttribute('data-release-id', 'release-1');
    expect(dialog).toHaveAttribute('data-title', 'Midnight Serenade');
    expect(dialog).toHaveAttribute('data-artist', 'John Doe');
    expect(dialog).toHaveAttribute('data-has-take-media-el', 'true');
  });

  it('discards the primed element when the modal closes', () => {
    render(<ReleaseCard {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /play midnight serenade/i }));
    fireEvent.click(screen.getByTestId('close-play-dialog'));

    expect(discardMediaEl).toHaveBeenCalled();
    expect(screen.getByTestId('release-play-dialog')).toHaveAttribute('data-open', 'false');
  });

  it('disables Play and skips the dialog when the release has no playable track', () => {
    render(<ReleaseCard {...defaultProps} playSrc={null} />);

    expect(screen.getByRole('button', { name: /play midnight serenade/i })).toBeDisabled();
    expect(screen.queryByTestId('release-play-dialog')).not.toBeInTheDocument();
  });

  it('warms the release detail fetch when Play gains focus', () => {
    render(<ReleaseCard {...defaultProps} />);

    expect(screen.getByTestId('release-play-dialog')).toHaveAttribute('data-prefetch', 'false');
    fireEvent.focus(screen.getByRole('button', { name: /play midnight serenade/i }));

    expect(screen.getByTestId('release-play-dialog')).toHaveAttribute('data-prefetch', 'true');
  });

  it('should have aria-label on Play button', () => {
    render(<ReleaseCard {...defaultProps} />);

    const playButton = screen.getByRole('button', { name: /play midnight serenade/i });
    expect(playButton).toHaveAttribute('aria-label', 'Play Midnight Serenade');
  });

  it('should render Download button to the right of the Play button', () => {
    render(<ReleaseCard {...defaultProps} />);

    const playButton = screen.getByRole('button', { name: /play midnight serenade/i });
    const downloadButton = screen.getByTestId('deferred-download-dialog');

    expect(downloadButton).toBeInTheDocument();
    expect(downloadButton).toHaveAttribute('data-release-id', 'release-1');
    expect(downloadButton).toHaveAttribute('data-release-title', 'Midnight Serenade');
    expect(downloadButton).toHaveAttribute('data-artist', 'John Doe');

    const ordering = playButton.compareDocumentPosition(downloadButton);
    expect(ordering & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('should style the root as a bordered punk photo card', () => {
    const { container } = render(<ReleaseCard {...defaultProps} />);

    const card = container.firstElementChild;
    expect(card).toHaveClass('border-2', 'border-black', 'shadow-zine-sm');
    expect(card).not.toHaveClass('rounded-lg');
    expect(card).not.toHaveClass('shadow-sm');
  });

  it('should scale up on hover on desktop only', () => {
    const { container } = render(<ReleaseCard {...defaultProps} />);

    const card = container.firstElementChild;
    expect(card).toHaveClass(
      'relative',
      'transition-transform',
      'md:hover:scale-[1.03]',
      'md:hover:z-10'
    );
  });

  it('should style the Play button as a square ink-stamp', () => {
    render(<ReleaseCard {...defaultProps} />);

    const playButton = screen.getByRole('button', { name: /play midnight serenade/i });
    expect(playButton).toHaveClass('shadow-zine-ink');
    expect(playButton).not.toHaveClass('rounded-md');
  });

  it('lets the action row wrap inside a narrow column', () => {
    render(<ReleaseCard {...defaultProps} />);

    const playButton = screen.getByRole('button', { name: /play midnight serenade/i });
    expect(playButton.parentElement).toHaveClass('flex-wrap');
  });

  it('should stamp the download trigger with the punk frame', () => {
    render(<ReleaseCard {...defaultProps} />);

    const downloadTrigger = screen.getByTestId('deferred-download-dialog');
    expect(downloadTrigger).toHaveClass('border-2', 'border-black', 'shadow-zine-ink');
    expect(downloadTrigger).not.toHaveClass('rounded-md');
    expect(downloadTrigger).not.toHaveClass('border-0');
  });
});
