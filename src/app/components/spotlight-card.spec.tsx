/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  SPOTLIGHT_COVER_SIZES,
  type SpotlightCard as SpotlightCardData,
} from '@/utils/spotlight-card';

import { SpotlightCard } from './spotlight-card';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// createElement, not JSX: the stand-in is a plain <img> echoing the props the
// card passes (no-img-element would flag a JSX one).
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    sizes,
    priority,
    unoptimized,
  }: {
    src: string;
    alt: string;
    sizes?: string;
    priority?: boolean;
    unoptimized?: boolean;
  }) =>
    createElement('img', {
      src,
      alt,
      sizes,
      'data-priority': priority === undefined ? undefined : String(priority),
      'data-unoptimized': String(Boolean(unoptimized)),
    }),
}));

const dialog = vi.hoisted(() => ({
  openPlayer: vi.fn(),
  warmPlayer: vi.fn(),
  playSrcs: [] as Array<string | null>,
}));

// The real hook primes an audio element; this stand-in keeps its contract
// (openPlayer opens, onOpenChange closes) and records what it was given.
vi.mock('@/hooks/use-release-play-dialog', async () => {
  const { useState } = await import('react');
  return {
    useReleasePlayDialog: (playSrc: string | null) => {
      const [playerOpen, setPlayerOpen] = useState(false);
      dialog.playSrcs.push(playSrc);
      return {
        playerOpen,
        prefetchPlayer: false,
        openPlayer: () => {
          dialog.openPlayer();
          setPlayerOpen(true);
        },
        handlePlayerOpenChange: setPlayerOpen,
        warmPlayer: dialog.warmPlayer,
        takeMediaEl: () => null,
      };
    },
  };
});

vi.mock('./release-play-dialog', () => ({
  ReleasePlayDialog: ({
    open,
    releaseId,
    title,
    artistName,
    headingOrder,
    centered,
    initialTrackNumber,
    shareWidget,
    footer,
    onOpenChange,
    onCloseAutoFocus,
  }: {
    open: boolean;
    releaseId: string;
    title: string;
    artistName: string | null;
    headingOrder?: string;
    centered?: boolean;
    initialTrackNumber?: number;
    shareWidget?: React.ReactNode;
    footer?: React.ReactNode;
    onOpenChange: (open: boolean) => void;
    onCloseAutoFocus?: (event: Event) => void;
  }) =>
    open ? (
      <div
        role="dialog"
        aria-label="player"
        data-release-id={releaseId}
        data-title={title}
        data-artist-name={artistName ?? ''}
        data-heading-order={headingOrder}
        data-centered={String(centered)}
        data-initial-track-number={initialTrackNumber?.toString() ?? ''}
        data-has-footer={String(footer !== undefined)}
      >
        {shareWidget}
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            onCloseAutoFocus?.(new Event('focus'));
          }}
        >
          close
        </button>
      </div>
    ) : null,
}));

vi.mock('./release-share-widget', () => ({
  ReleaseShareWidget: ({
    artistSlug,
    artistName,
    releaseTitle,
  }: {
    artistSlug: string | null;
    artistName: string | null;
    releaseTitle: string;
  }) => (
    <div
      data-testid="share-widget"
      data-artist-slug={artistSlug ?? ''}
      data-artist-name={artistName ?? ''}
      data-release-title={releaseTitle}
    />
  ),
}));

const CARD: SpotlightCardData = {
  releaseId: 'rel-1',
  title: 'Spot Album',
  year: 2024,
  artistName: 'Spot Artist',
  artistSlug: 'spot-artist',
  coverArt: '/media/releases/rel-1/cover.jpg',
  playSrc: 'https://cdn.example/1.mp3',
  initialTrackNumber: 2,
};

const renderCard = (overrides: Partial<SpotlightCardData> = {}) => {
  render(<SpotlightCard card={{ ...CARD, ...overrides }} />);
  return userEvent.setup({ delay: null });
};

const playButton = (): HTMLElement =>
  screen.getByRole('button', { name: 'Play Spot Album by Spot Artist' });

describe('SpotlightCard', () => {
  beforeEach(() => {
    dialog.playSrcs = [];
  });

  it('labels the cover button with the release and artist, and says it opens a dialog', () => {
    renderCard();

    expect(playButton()).toHaveAttribute('type', 'button');
    expect(playButton()).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('labels the cover button with the release alone when there is no artist', () => {
    renderCard({ artistName: null });

    expect(screen.getByRole('button', { name: 'Play Spot Album' })).toBeInTheDocument();
  });

  it('shows the cover at the shared sizes, without a priority preload', () => {
    renderCard();

    const cover = screen.getByAltText('Spot Album cover art');
    expect(cover).toHaveAttribute('sizes', SPOTLIGHT_COVER_SIZES);
    expect(cover).not.toHaveAttribute('data-priority');
    expect(playButton()).toContainElement(cover);
  });

  it('passes a pass-through cover through unoptimized', () => {
    renderCard({ coverArt: 'data:image/webp;base64,AAAA' });

    expect(screen.getByAltText('Spot Album cover art')).toHaveAttribute('data-unoptimized', 'true');
  });

  it('shows the title in place of a missing cover', () => {
    renderCard({ coverArt: null });

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(playButton()).toHaveTextContent('Spot Album');
  });

  it('captions the cover with the artist in semibold, then the linked title and year', () => {
    renderCard();

    const artist = screen.getByText('Spot Artist');
    expect(artist).toHaveClass('font-semibold');
    const link = screen.getByRole('link', { name: 'Spot Album' });
    expect(link).toHaveAttribute('href', '/artists/spot-artist/releases');
    expect(link.parentElement).toHaveTextContent('Spot Album (2024)');
    expect(artist.parentElement).toHaveClass('text-center');
  });

  it('leaves the title as text when there is no artist page', () => {
    renderCard({ artistSlug: null });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Spot Album (2024)')).toBeInTheDocument();
  });

  it('primes the card track and opens the artist-first dialog on click', async () => {
    const user = renderCard();

    await user.click(playButton());

    expect(dialog.openPlayer).toHaveBeenCalledTimes(1);
    expect(dialog.playSrcs.at(-1)).toBe('https://cdn.example/1.mp3');
    const opened = screen.getByRole('dialog');
    expect(opened).toHaveAttribute('data-release-id', 'rel-1');
    expect(opened).toHaveAttribute('data-title', 'Spot Album');
    expect(opened).toHaveAttribute('data-artist-name', 'Spot Artist');
    expect(opened).toHaveAttribute('data-heading-order', 'artist-first');
    expect(opened).toHaveAttribute('data-centered', 'true');
    expect(opened).toHaveAttribute('data-initial-track-number', '2');
    expect(opened).toHaveAttribute('data-has-footer', 'false');
  });

  it('puts the share widget for the artist page in the dialog', async () => {
    const user = renderCard();

    await user.click(playButton());

    const share = screen.getByTestId('share-widget');
    expect(share).toHaveAttribute('data-artist-slug', 'spot-artist');
    expect(share).toHaveAttribute('data-artist-name', 'Spot Artist');
    expect(share).toHaveAttribute('data-release-title', 'Spot Album');
  });

  it('starts the fallback card on the first track', async () => {
    const user = renderCard({ initialTrackNumber: null });

    await user.click(playButton());

    expect(screen.getByRole('dialog')).toHaveAttribute('data-initial-track-number', '');
  });

  it('warms the dialog on pointer enter and on focus', () => {
    renderCard();

    fireEvent.pointerEnter(playButton());
    act(() => playButton().focus());

    expect(dialog.warmPlayer).toHaveBeenCalledTimes(2);
  });

  it('returns focus to the cover button when the dialog closes', async () => {
    const user = renderCard();

    await user.click(playButton());
    await user.click(screen.getByRole('button', { name: 'close' }));

    expect(playButton()).toHaveFocus();
  });

  it('disables the cover and mounts no dialog when nothing is playable', () => {
    renderCard({ playSrc: null });

    expect(playButton()).toBeDisabled();
    expect(dialog.playSrcs.at(-1)).toBeNull();
    expect(screen.getByRole('link', { name: 'Spot Album' })).toHaveAttribute(
      'href',
      '/artists/spot-artist/releases'
    );
  });

  it('opens nothing from a disabled cover', () => {
    renderCard({ playSrc: null });

    fireEvent.click(playButton());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the play roundel on hover, focus and touch screens', () => {
    renderCard();

    const roundel = playButton().querySelector('[data-slot="spotlight-play-roundel"]');
    expect(roundel).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-visible:opacity-100',
      '[@media(hover:none)]:opacity-100'
    );
    expect(roundel).toHaveAttribute('aria-hidden', 'true');
  });

  it('scales the cover slightly on hover', () => {
    renderCard();

    expect(playButton()).toHaveClass('group', 'hover:scale-[1.03]');
  });

  it('tapes a corner of the cover', () => {
    renderCard();

    expect(playButton().querySelector('[data-slot="spotlight-tape"]')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });
});
