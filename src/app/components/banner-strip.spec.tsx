/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen } from '@testing-library/react';

import { BannerStrip } from './banner-strip';

import type { BannerSlotData } from './banner-carousel';

// Render next/image as a plain <img>, forwarding only the DOM-safe props we
// assert on so boolean hints (fill/priority) don't leak non-standard
// attributes onto the element.
vi.mock('next/image', () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) =>
    createElement('img', { src, alt, className }),
}));

// The rotating ticker has its own spec; stub it so these tests stay focused on
// the stitched image band and can assert the props it receives.
vi.mock('./banner-notification-ticker', () => ({
  BannerNotificationTicker: ({
    banners,
    rotationInterval,
  }: {
    banners: BannerSlotData[];
    rotationInterval?: number;
  }) => (
    <div
      data-testid="banner-notification-ticker"
      data-count={banners.length}
      data-interval={String(rotationInterval)}
    />
  ),
}));

const makeBanner = (slot: number): BannerSlotData => ({
  slotNumber: slot,
  imageFilename: `banner-${slot}.jpg`,
  notification: null,
});

const THREE_BANNERS: BannerSlotData[] = [makeBanner(1), makeBanner(2), makeBanner(3)];

describe('BannerStrip', () => {
  it('renders the desktop notification ticker, forwarding the banners and interval', () => {
    render(<BannerStrip banners={THREE_BANNERS} rotationInterval={8} />);

    const ticker = screen.getByTestId('banner-notification-ticker');
    expect(ticker).toHaveAttribute('data-count', '3');
    expect(ticker).toHaveAttribute('data-interval', '8');
  });

  it('renders one image per banner', () => {
    render(<BannerStrip banners={THREE_BANNERS} />);

    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('labels each image with its slot number', () => {
    render(<BannerStrip banners={THREE_BANNERS} />);

    expect(screen.getByRole('img', { name: 'Banner 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Banner 2' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Banner 3' })).toBeInTheDocument();
  });

  it('builds each image src from the banner CDN path and filename', () => {
    render(<BannerStrip banners={[makeBanner(2)]} />);

    expect(screen.getByRole('img', { name: 'Banner 2' })).toHaveAttribute(
      'src',
      '/media/banners/banner-2.jpg'
    );
  });

  it('caps the strip at 1280px wide (max-w-7xl) and centers it', () => {
    const { container } = render(<BannerStrip banners={THREE_BANNERS} />);

    const strip = container.querySelector('section');
    expect(strip).toHaveClass('max-w-7xl');
    expect(strip).toHaveClass('mx-auto');
  });

  it('is gated to desktop — hidden below md, shown at md and up', () => {
    const { container } = render(<BannerStrip banners={THREE_BANNERS} />);

    const strip = container.querySelector('section');
    expect(strip).toHaveClass('hidden', 'md:block');
  });

  it('reserves the native banner aspect ratio on every cell to avoid layout shift', () => {
    const { container } = render(<BannerStrip banners={THREE_BANNERS} />);

    const reservedCells = container.querySelectorAll('.aspect-\\[1920\\/1097\\]');
    expect(reservedCells).toHaveLength(3);
  });

  it('gives every cell an equal-width flex slice so the banners stitch seamlessly', () => {
    const { container } = render(<BannerStrip banners={THREE_BANNERS} />);

    expect(container.querySelectorAll('.flex-1')).toHaveLength(3);
  });

  it('renders nothing when there are no banners', () => {
    const { container } = render(<BannerStrip banners={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
