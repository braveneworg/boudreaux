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

import type { ZineAccent } from './ui/zine-panel';

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
    sheetOnPhone,
    initialTrackNumber,
    shareWidget,
    footer,
    onOpenChange,
    onCloseAutoFocus,
    accent,
  }: {
    open: boolean;
    releaseId: string;
    title: string;
    artistName: string | null;
    headingOrder?: string;
    centered?: boolean;
    sheetOnPhone?: boolean;
    initialTrackNumber?: number;
    shareWidget?: React.ReactNode;
    footer?: React.ReactNode;
    onOpenChange: (open: boolean) => void;
    onCloseAutoFocus?: (event: Event) => void;
    accent?: string;
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
        data-sheet-on-phone={String(sheetOnPhone)}
        data-initial-track-number={initialTrackNumber?.toString() ?? ''}
        data-has-footer={String(footer !== undefined)}
        data-accent={accent ?? ''}
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

interface CardOptions {
  caption?: 'artist-and-title' | 'title';
  accent?: ZineAccent;
}

const renderCard = (overrides: Partial<SpotlightCardData> = {}, options: CardOptions = {}) => {
  render(<SpotlightCard card={{ ...CARD, ...overrides }} {...options} />);
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

  it('marks the cover hydrated once it runs in the browser', () => {
    renderCard();

    expect(playButton()).toHaveAttribute('data-hydrated', 'true');
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

  it('captions the cover with the linked artist in semibold, then the title and year as text', () => {
    renderCard();

    const artist = screen.getByRole('link', { name: 'Spot Artist' });
    expect(artist).toHaveAttribute('href', '/artists/spot-artist');
    expect(artist.parentElement).toHaveClass('font-semibold');
    expect(screen.getByText('Spot Album (2024)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Spot Album' })).not.toBeInTheDocument();
    expect(artist.parentElement?.parentElement).toHaveClass('text-center');
  });

  it('captions the cover with the title alone when asked, with no artist, year or link', () => {
    renderCard({}, { caption: 'title' });

    const caption = screen.getByText('Spot Album', { exact: true });
    expect(caption.parentElement).toHaveClass('text-center');
    expect(caption).not.toHaveClass('font-semibold');
    expect(screen.queryByText('Spot Album (2024)')).not.toBeInTheDocument();
    expect(screen.queryByText('Spot Artist')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps the cover button named by the release and artist under a title caption', () => {
    renderCard({}, { caption: 'title' });

    expect(playButton()).toBeInTheDocument();
  });

  it('opens the dialog in the given accent', async () => {
    const user = renderCard({}, { accent: 'cyan' });

    await user.click(playButton());

    expect(screen.getByRole('dialog')).toHaveAttribute('data-accent', 'cyan');
  });

  it('leaves the dialog accent to the dialog by default', async () => {
    const user = renderCard();

    await user.click(playButton());

    expect(screen.getByRole('dialog')).toHaveAttribute('data-accent', '');
  });

  it('leaves the artist as text when there is no artist page', () => {
    renderCard({ artistSlug: null });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Spot Artist')).toBeInTheDocument();
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

  it('opens the dialog as a sheet sized to the screen on a phone', async () => {
    const user = renderCard();

    await user.click(playButton());

    expect(screen.getByRole('dialog')).toHaveAttribute('data-sheet-on-phone', 'true');
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
    expect(screen.getByRole('link', { name: 'Spot Artist' })).toHaveAttribute(
      'href',
      '/artists/spot-artist'
    );
  });

  it('opens nothing from a disabled cover', () => {
    renderCard({ playSrc: null });

    fireEvent.click(playButton());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the play stamp on hover and keyboard focus only', () => {
    renderCard();

    const overlay = playButton().querySelector('[data-slot="spotlight-play-stamp"]');
    expect(overlay).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-visible:opacity-100'
    );
    expect(overlay).not.toHaveClass('[@media(hover:none)]:opacity-100');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  it('cuts the play stamp square and upright, a black glyph on white in a zine box', () => {
    renderCard();

    const stamp = playButton().querySelector('[data-slot="spotlight-play-stamp"] > span');
    expect(stamp).toHaveClass('border-2', 'border-black', 'bg-white', 'shadow-zine-ink');
    expect(stamp?.className).not.toMatch(/rounded|rotate|card-accent/);
    expect(stamp?.querySelector('svg')).toHaveClass('fill-current', 'text-black');
  });

  it('draws the play glyph as a pointed triangle, not the rounded lucide mark', () => {
    renderCard();

    const glyph = playButton().querySelector('[data-slot="spotlight-play-stamp"] svg');
    expect(glyph?.querySelector('polygon')).toHaveAttribute('points', '6 3 20 12 6 21');
    expect(glyph?.querySelector('path')).toBeNull();
    expect(glyph).toHaveAttribute('stroke', 'none');
  });

  it('scales the cover slightly on hover', () => {
    renderCard();

    expect(playButton()).toHaveClass('group', 'hover:scale-[1.03]');
  });

  it('puts no tape on the cover', () => {
    renderCard();

    expect(playButton().querySelector('[data-slot="spotlight-tape"]')).toBeNull();
  });

  it('fills the phone width and caps the card at the cover width its sizes name from sm', () => {
    renderCard();

    const card = playButton().parentElement;
    expect(card).toHaveClass('mx-auto', 'w-full', 'sm:max-w-52');
    expect(card).not.toHaveClass('max-w-52');
    expect(SPOTLIGHT_COVER_SIZES).toBe('(min-width: 640px) 208px, 100vw');
  });
});
