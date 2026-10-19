/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

// The listening modal is real; only its external edges are stood in for: the
// release detail fetch, the video.js player and the lazily-loaded social links.
const query = vi.hoisted(() => ({ useReleaseQuery: vi.fn() }));
vi.mock('@/hooks/queries/use-release-query', () => ({
  useReleaseQuery: (...args: unknown[]): unknown => query.useReleaseQuery(...args),
}));

vi.mock('./release-player', () => ({
  ReleasePlayer: ({ initialTrackNumber }: { initialTrackNumber?: number }) => (
    <div data-testid="release-player" data-initial-track-number={initialTrackNumber ?? ''} />
  ),
}));

vi.mock('./social-share-widget', () => ({
  SocialShareWidget: ({ url }: { url: string }) => (
    <div data-testid="social-share-widget" data-url={url} />
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
  caption?: 'artist-and-title' | 'releases';
  accent?: ZineAccent | 'random';
  linkedHeading?: boolean;
}

const renderCard = (overrides: Partial<SpotlightCardData> = {}, options: CardOptions = {}) => {
  render(<SpotlightCard card={{ ...CARD, ...overrides }} {...options} />);
  return userEvent.setup({ delay: null });
};

const playButton = (): HTMLElement =>
  screen.getByRole('button', { name: 'Play Spot Album by Spot Artist', hidden: true });

const dialog = (): HTMLElement => screen.getByRole('dialog');

/** The `enabled` the listening modal last asked the release query for. */
const lastQueryEnabled = (): unknown => query.useReleaseQuery.mock.calls.at(-1)?.[1]?.enabled;

describe('SpotlightCard', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'https://fakefour.test');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    query.useReleaseQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { id: 'rel-1', title: 'Spot Album' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('captions a /releases cover with the artist, linked to their releases, above the title alone', () => {
    renderCard({}, { caption: 'releases' });

    const artist = screen.getByRole('link', { name: 'Spot Artist' });
    expect(artist).toHaveAttribute('href', '/releases?artist=spot-artist');
    expect(artist).toHaveClass('underline', 'underline-offset-4', 'hover:no-underline');
    expect(artist.parentElement).toHaveClass('font-semibold');
    const title = screen.getByText('Spot Album', { exact: true });
    expect(title).not.toHaveClass('font-semibold');
    expect(artist.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Spot Album (2024)')).not.toBeInTheDocument();
    expect(title.parentElement).toHaveClass('text-center');
  });

  it('URI-encodes the artist slug in the /releases caption link', () => {
    renderCard({ artistSlug: 'spot artist&co' }, { caption: 'releases' });

    expect(screen.getByRole('link', { name: 'Spot Artist' })).toHaveAttribute(
      'href',
      '/releases?artist=spot%20artist%26co'
    );
  });

  it('leaves the /releases caption artist as text when there is no slug', () => {
    renderCard({ artistSlug: null }, { caption: 'releases' });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Spot Artist')).toHaveClass('font-semibold');
    expect(screen.getByText('Spot Album', { exact: true })).toBeInTheDocument();
  });

  it('gives the /releases caption no artist line when there is no artist name', () => {
    const { container } = render(
      <SpotlightCard card={{ ...CARD, artistName: null }} caption="releases" />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Spot Artist')).not.toBeInTheDocument();
    expect(container.querySelector('.font-semibold')).toBeNull();
    expect(screen.getByText('Spot Album', { exact: true })).toBeInTheDocument();
  });

  it('keeps the cover button named by the release and artist under a /releases caption', () => {
    renderCard({}, { caption: 'releases' });

    expect(playButton()).toBeInTheDocument();
  });

  it('frames the modal in the page accent it is given', async () => {
    const user = renderCard({}, { accent: 'cyan' });

    await user.click(playButton());

    expect(dialog()).toHaveClass('zine-accent-cyan');
  });

  it('links the modal heading and adds the year and a "View all releases" footer', async () => {
    const user = renderCard({}, { linkedHeading: true });

    await user.click(playButton());

    expect(dialog()).toHaveAccessibleDescription('Spot Album (2024)');
    expect(within(dialog()).getByRole('link', { name: 'Spot Artist' })).toHaveAttribute(
      'href',
      '/artists/spot-artist'
    );
    const viewAll = within(dialog()).getByRole('link', { name: 'View all releases' });
    expect(viewAll).toHaveAttribute('href', '/releases?artist=spot-artist');
    // Smaller on a phone, where the sheet's cover is already at its floor.
    expect(viewAll.parentElement).toHaveClass('text-center', 'max-sm:text-xs');
  });

  it('links nothing in the modal for a linked heading without an artist page', async () => {
    const user = renderCard({ artistSlug: null }, { linkedHeading: true });

    await user.click(playButton());

    expect(dialog()).toHaveAccessibleDescription('Spot Album (2024)');
    expect(within(dialog()).queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps the plain modal heading by default', async () => {
    const user = renderCard();

    await user.click(playButton());

    expect(dialog()).toHaveAccessibleDescription('Spot Album');
    expect(within(dialog()).queryByRole('link')).not.toBeInTheDocument();
  });

  it('leaves the artist as text when there is no artist page', () => {
    renderCard({ artistSlug: null });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Spot Artist')).toBeInTheDocument();
    expect(screen.getByText('Spot Album (2024)')).toBeInTheDocument();
  });

  it("plays the card's track from the cover click", async () => {
    const user = renderCard();

    await user.click(playButton());

    const play = vi.mocked(HTMLMediaElement.prototype.play);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.instances[0]).toHaveAttribute('src', 'https://cdn.example/1.mp3');
  });

  it('opens the modal as a sheet, the artist leading the heading', async () => {
    const user = renderCard();

    await user.click(playButton());

    expect(dialog()).toHaveAccessibleName('Spot Artist');
    expect(screen.getByText('Spot Artist', { selector: '[data-slot="dialog-title"]' })).toHaveClass(
      'text-center'
    );
    expect(dialog()).toHaveClass('max-sm:bottom-0');
  });

  it("starts the player on the card's track", async () => {
    const user = renderCard();

    await user.click(playButton());

    expect(screen.getByTestId('release-player')).toHaveAttribute('data-initial-track-number', '2');
  });

  it('starts the fallback card on the first track', async () => {
    const user = renderCard({ initialTrackNumber: null });

    await user.click(playButton());

    expect(screen.getByTestId('release-player')).toHaveAttribute('data-initial-track-number', '');
  });

  it("shares the artist's page from the modal", async () => {
    const user = renderCard();

    await user.click(playButton());

    expect(await screen.findByTestId('social-share-widget')).toHaveAttribute(
      'data-url',
      'https://fakefour.test/artists/spot-artist'
    );
  });

  it('warms the modal on pointer enter', () => {
    renderCard();
    expect(lastQueryEnabled()).toBe(false);

    fireEvent.pointerEnter(playButton());

    expect(lastQueryEnabled()).toBe(true);
  });

  it('warms the modal on focus', () => {
    renderCard();

    act(() => playButton().focus());

    expect(lastQueryEnabled()).toBe(true);
  });

  it('returns focus to the cover button when the modal closes', async () => {
    const user = renderCard();

    await user.click(playButton());
    await user.click(within(dialog()).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(playButton()).toHaveFocus());
  });

  it('disables the cover and mounts no modal when nothing is playable', () => {
    renderCard({ playSrc: null });

    expect(playButton()).toBeDisabled();
    expect(query.useReleaseQuery).not.toHaveBeenCalled();
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
