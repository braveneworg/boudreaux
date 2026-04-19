/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BannerCarousel, type BannerSlotData } from './banner-carousel';

vi.mock('@/lib/utils/cloudfront-loader', () => ({
  cloudfrontLoader: ({ src }: { src: string }) => src,
}));

vi.mock('@/lib/utils/color', () => ({
  isDarkColor: () => false,
}));

vi.mock('@/lib/validation/banner-notification-schema', () => ({
  sanitizeNotificationHtml: (html: string) => html,
  addLinkAttributes: (html: string) => html,
}));

/* ---------- helpers ---------- */

function makeBanner(
  slot: number,
  notification: BannerSlotData['notification'] = null
): BannerSlotData {
  return {
    slotNumber: slot,
    imageFilename: `banner-${slot}.jpg`,
    notification,
  };
}

function makeNotification(id: string, content: string): BannerSlotData['notification'] {
  return { id, content, textColor: '#fff', backgroundColor: '#000' };
}

const THREE_BANNERS: BannerSlotData[] = [
  makeBanner(1, makeNotification('n1', 'Notification 1')),
  makeBanner(2, makeNotification('n2', 'Notification 2')),
  makeBanner(3, makeNotification('n3', 'Notification 3')),
];

const TWO_BANNERS: BannerSlotData[] = [
  makeBanner(1, makeNotification('n1', 'First notification')),
  makeBanner(2, null),
];

/** Fire transitionend on the track element to complete a slide animation */
function fireTransitionEnd() {
  const track = document.querySelector('[role="group"]');
  if (track) {
    fireEvent.transitionEnd(track);
  }
}

/** Stub setPointerCapture/releasePointerCapture for jsdom */
function stubPointerCapture() {
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
}

/* ---------- tests ---------- */

describe('BannerCarousel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubPointerCapture();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /* ---- empty state ---- */

  describe('empty state', () => {
    it('renders a CLS placeholder when no banners are provided', () => {
      const { container } = render(<BannerCarousel banners={[]} />);

      const section = container.querySelector('section');
      expect(section).toHaveAttribute('aria-hidden', 'true');
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });
  });

  /* ---- single banner ---- */

  describe('single banner', () => {
    it('renders the banner without dot indicators', () => {
      render(<BannerCarousel banners={[makeBanner(1)]} />);

      expect(screen.getByAltText('Banner 1')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('renders a notification strip when present', () => {
      const banner = makeBanner(1, makeNotification('n1', 'Hello world'));
      render(<BannerCarousel banners={[banner]} />);

      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('hides the notification strip when notification is null', () => {
      const banner = makeBanner(1, null);
      const { container } = render(<BannerCarousel banners={[banner]} />);

      const stripContainer = container.querySelector(
        '[style*="min-height: 2.5rem"]'
      ) as HTMLElement;
      expect(stripContainer.style.opacity).toBe('0');
    });
  });

  /* ---- multiple banners ---- */

  describe('multiple banners', () => {
    it('renders dot indicators for each banner', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('shows first banner notification on initial render', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);

      expect(screen.getByText('Notification 1')).toBeInTheDocument();
    });

    it('announces slide position to screen readers', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);

      expect(screen.getByText('Showing banner 1 of 3')).toBeInTheDocument();
    });
  });

  /* ---- notification strip animation direction ---- */

  describe('notification strip animation', () => {
    it('does not apply animation on the static (non-transitioning) strip', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const strip = screen.getByText('Notification 1');
      expect(strip.style.animation).toBe('');
    });

    it('uses banner-strip-slide-right for incoming strip during transition', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const carousel = screen.getByRole('region', { name: 'Banner carousel' });
      carousel.focus();
      fireEvent.keyDown(carousel, { key: 'ArrowRight' });

      const incomingStrip = screen.getByText('Notification 2');
      expect(incomingStrip.style.animation).toContain('banner-strip-slide-right');
    });

    it('uses banner-strip-exit-right for outgoing strip during transition', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const carousel = screen.getByRole('region', { name: 'Banner carousel' });
      carousel.focus();
      fireEvent.keyDown(carousel, { key: 'ArrowRight' });

      const outgoingStrip = screen.getByText('Notification 1');
      expect(outgoingStrip.style.animation).toContain('banner-strip-exit-right');
    });
  });

  /* ---- simultaneous banner + notification animation ---- */

  describe('simultaneous animation', () => {
    it('shows both outgoing and incoming notifications during transition', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(<BannerCarousel banners={THREE_BANNERS} />);

      expect(screen.getByText('Notification 1')).toBeInTheDocument();

      // Click dot for slide 2 (next adjacent slide)
      const tabs = screen.getAllByRole('tab');
      await user.click(tabs[1]);

      // BEFORE transitionend fires, both notifications should be in the DOM
      expect(screen.getByText('Notification 1')).toBeInTheDocument();
      expect(screen.getByText('Notification 2')).toBeInTheDocument();
    });

    it('shows both notifications on keyboard navigation', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const carousel = screen.getByRole('region', { name: 'Banner carousel' });
      carousel.focus();

      fireEvent.keyDown(carousel, { key: 'ArrowRight' });

      // Both should be present during the transition
      expect(screen.getByText('Notification 1')).toBeInTheDocument();
      expect(screen.getByText('Notification 2')).toBeInTheDocument();
    });

    it('removes outgoing strip after transition completes', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const tabs = screen.getAllByRole('tab');
      await user.click(tabs[1]);

      // Both present during transition
      expect(screen.getByText('Notification 1')).toBeInTheDocument();
      expect(screen.getByText('Notification 2')).toBeInTheDocument();

      // Complete the transition
      act(() => fireTransitionEnd());

      // Only the new notification remains
      expect(screen.getByText('Notification 2')).toBeInTheDocument();
      expect(screen.queryByText('Notification 1')).not.toBeInTheDocument();
    });
  });

  /* ---- auto-rotation ---- */

  describe('auto-rotation', () => {
    it('auto-advances to the next slide after the rotation interval', () => {
      render(<BannerCarousel banners={THREE_BANNERS} rotationInterval={3} />);

      expect(screen.getByText('Notification 1')).toBeInTheDocument();

      // Advance past the rotation interval
      act(() => vi.advanceTimersByTime(3000));

      // Both outgoing and incoming should be present during transition
      expect(screen.getByText('Notification 1')).toBeInTheDocument();
      expect(screen.getByText('Notification 2')).toBeInTheDocument();
    });

    it('does not auto-rotate with a single banner', () => {
      const banner = makeBanner(1, makeNotification('n1', 'Only one'));
      render(<BannerCarousel banners={[banner]} rotationInterval={3} />);

      act(() => vi.advanceTimersByTime(10000));

      expect(screen.getByText('Only one')).toBeInTheDocument();
    });
  });

  /* ---- keyboard navigation ---- */

  describe('keyboard navigation', () => {
    it('navigates to the next slide on ArrowRight', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const carousel = screen.getByRole('region', { name: 'Banner carousel' });
      carousel.focus();

      fireEvent.keyDown(carousel, { key: 'ArrowRight' });

      expect(screen.getByText('Notification 2')).toBeInTheDocument();
    });

    it('navigates to the previous slide on ArrowLeft', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const carousel = screen.getByRole('region', { name: 'Banner carousel' });
      carousel.focus();

      // Go forward first, then complete transition
      fireEvent.keyDown(carousel, { key: 'ArrowRight' });
      act(() => fireTransitionEnd());

      // Now go back
      fireEvent.keyDown(carousel, { key: 'ArrowLeft' });

      expect(screen.getByText('Notification 1')).toBeInTheDocument();
    });

    it('wraps around from first to last slide on ArrowLeft', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const carousel = screen.getByRole('region', { name: 'Banner carousel' });
      carousel.focus();

      fireEvent.keyDown(carousel, { key: 'ArrowLeft' });

      expect(screen.getByText('Notification 3')).toBeInTheDocument();
    });
  });

  /* ---- dot indicator navigation ---- */

  describe('dot indicator navigation', () => {
    it('navigates to adjacent slide via dot click', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const tabs = screen.getAllByRole('tab');
      await user.click(tabs[1]);

      expect(screen.getByText('Notification 2')).toBeInTheDocument();
    });

    it('jumps instantly to non-adjacent slide', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(<BannerCarousel banners={THREE_BANNERS} />);

      // Jump from index 0 to index 2 (non-adjacent)
      const tabs = screen.getAllByRole('tab');
      await user.click(tabs[2]);

      expect(screen.getByText('Notification 3')).toBeInTheDocument();
    });

    it('does not navigate when clicking the active dot', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const tabs = screen.getAllByRole('tab');
      await user.click(tabs[0]);

      // Should remain on the first slide
      expect(screen.getByText('Notification 1')).toBeInTheDocument();
    });

    it('updates aria-selected on the active dot', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      const fourBanners: BannerSlotData[] = [
        makeBanner(1, makeNotification('n1', 'N1')),
        makeBanner(2, makeNotification('n2', 'N2')),
        makeBanner(3, makeNotification('n3', 'N3')),
        makeBanner(4, makeNotification('n4', 'N4')),
      ];
      render(<BannerCarousel banners={fourBanners} />);

      const tabs = screen.getAllByRole('tab');

      // From index 0, index 3 is prevIdx (adjacent) in a 4-element ring.
      // Index 2 is truly non-adjacent → instant jump.
      await user.click(tabs[2]);

      expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
      expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    });
  });

  /* ---- notification visibility ---- */

  describe('notification visibility', () => {
    it('fades out the strip container when the incoming slide has no notification', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      const { container } = render(<BannerCarousel banners={TWO_BANNERS} />);

      expect(screen.getByText('First notification')).toBeInTheDocument();

      // Navigate to slide 2 which has no notification
      const tabs = screen.getAllByRole('tab');
      await user.click(tabs[1]);

      const stripContainer = container.querySelector(
        '[style*="min-height: 2.5rem"]'
      ) as HTMLElement;
      expect(stripContainer.style.opacity).toBe('0');
    });

    it('applies notification colors from the banner data', () => {
      const banner = makeBanner(1, {
        id: 'colored',
        content: 'Colored strip',
        textColor: '#ff0000',
        backgroundColor: '#00ff00',
      });
      render(<BannerCarousel banners={[banner]} />);

      const strip = screen.getByText('Colored strip');
      expect(strip.style.color).toBe('rgb(255, 0, 0)');
      expect(strip.style.backgroundColor).toBe('rgb(0, 255, 0)');
    });
  });

  /* ---- custom className ---- */

  describe('className prop', () => {
    it('applies custom className to the outer section', () => {
      const { container } = render(
        <BannerCarousel banners={THREE_BANNERS} className="my-custom-class" />
      );

      const section = container.querySelector('section');
      expect(section).toHaveClass('my-custom-class');
    });
  });
});
