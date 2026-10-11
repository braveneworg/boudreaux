/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { BANNER_ASPECT_PADDING, BANNER_SLOTS } from '@/lib/constants/banner-slots';

import HomeLoading from './loading';

describe('HomeLoading', () => {
  it('renders the LCP banner with high fetch priority', () => {
    render(<HomeLoading />);
    const img = screen.getByTestId('lcp-banner-img');

    expect(img).toHaveAttribute('fetchpriority', 'high');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('uses a single fixed-width src for the Suspense fallback banner', () => {
    render(<HomeLoading />);
    const img = screen.getByTestId('lcp-banner-img');
    const expectedFilenameFragment = encodeURIComponent(BANNER_SLOTS[0].filename).replace(
      /\.webp$/,
      ''
    );

    expect(img.getAttribute('src')).toContain(expectedFilenameFragment);
    expect(img.getAttribute('src')).toContain('_w750.webp');
    // Intentionally no srcset/sizes on the Suspense fallback `<img>`. The
    // hydrated `BannerCarousel` uses Next/Image's responsive `priority`
    // preload, which emits matching `imagesrcset`/`imagesizes`. A
    // responsive fallback <img> here would let Chrome's preload picker
    // choose a variant that diverges from the hydrated <img>'s srcset.
    expect(img.getAttribute('srcset')).toBeNull();
    expect(img.getAttribute('sizes')).toBeNull();
  });

  it('reserves banner space using the shared aspect-ratio constant', () => {
    render(<HomeLoading />);
    const wrapper = screen.getByTestId('lcp-banner-img').parentElement;

    expect(wrapper).toHaveStyle({ paddingBottom: BANNER_ASPECT_PADDING });
  });

  // The skeleton must mirror the hydrated landing layout per breakpoint —
  // a mismatched fallback reads as a flash of unstyled/alien content on
  // every client-side navigation to `/` (the carousel is `md:hidden` on
  // desktop, where the stitched BannerStrip renders instead).
  it('scopes the carousel-shaped banner fallback to mobile (md:hidden)', () => {
    render(<HomeLoading />);
    const mobileBanner = screen.getByTestId('mobile-banner-skeleton');

    expect(mobileBanner).toHaveClass('md:hidden');
    expect(mobileBanner).toContainElement(screen.getByTestId('lcp-banner-img'));
  });

  it('renders a BannerStrip-shaped skeleton for md+ with one cell per slot', () => {
    render(<HomeLoading />);
    const strip = screen.getByTestId('banner-strip-skeleton');

    // Same frame classes as the real BannerStrip so the swap is seamless.
    expect(strip).toHaveClass('hidden', 'md:block', 'zine-accent-yellow', 'border-2');

    const cells = screen.getAllByTestId('banner-strip-skeleton-cell');
    expect(cells).toHaveLength(BANNER_SLOTS.length);
    cells.forEach((cell) => expect(cell).toHaveClass('aspect-[1920/1097]'));
  });

  it('wraps the content skeleton in the real ZinePanel with the landing accent', () => {
    const { container } = render(<HomeLoading />);
    const panel = container.querySelector('[data-slot="zine-panel"]');

    expect(panel).not.toBeNull();
    expect(panel).toHaveClass('zine-accent-yellow');
  });

  it('mirrors the landing stack: wordmark, then search, then the spotlight grid', () => {
    render(<HomeLoading />);

    const heading = screen.getByTestId('featured-heading-skeleton');
    const search = screen.getByTestId('search-skeleton');
    const grid = screen.getByTestId('spotlight-grid-skeleton');
    expect(heading.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(search.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lays the cover skeletons out one, two, then four to a row', () => {
    render(<HomeLoading />);

    expect(screen.getByTestId('spotlight-grid-skeleton')).toHaveClass(
      'grid',
      'grid-cols-1',
      'sm:grid-cols-2',
      'lg:grid-cols-4'
    );
  });

  it('gives each card skeleton a square cover and caption bars', () => {
    render(<HomeLoading />);

    const cards = screen.getAllByTestId('spotlight-card-skeleton');
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((card) => {
      expect(card.firstElementChild).toHaveClass('aspect-square');
      expect(card.lastElementChild?.children).toHaveLength(2);
    });
  });

  it('keeps each card skeleton to the card cover width', () => {
    render(<HomeLoading />);

    screen
      .getAllByTestId('spotlight-card-skeleton')
      .forEach((card) => expect(card).toHaveClass('mx-auto', 'w-full', 'max-w-52'));
  });

  it('no longer reserves room for the player or the headlines', () => {
    render(<HomeLoading />);

    expect(screen.queryByTestId('player-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('headlines-skeleton')).not.toBeInTheDocument();
  });
});
