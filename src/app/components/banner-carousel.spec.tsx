/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { isDarkColor } from '@/lib/utils/color';

import { BannerCarousel, type BannerSlotData } from './banner-carousel';

const mockIsDarkColor = vi.mocked(isDarkColor);

vi.mock('@/lib/utils/color', () => ({
  isDarkColor: vi.fn(() => false),
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

/** Fire pointer events with correct clientX values (jsdom lacks PointerEvent constructor) */
function firePointerDown(el: HTMLElement, clientX: number) {
  const event = new MouseEvent('pointerdown', { clientX, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  el.dispatchEvent(event);
}
function firePointerMove(el: HTMLElement, clientX: number) {
  const event = new MouseEvent('pointermove', { clientX, bubbles: true });
  el.dispatchEvent(event);
}
function firePointerUp(el: HTMLElement, clientX: number) {
  const event = new MouseEvent('pointerup', { clientX, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  el.dispatchEvent(event);
}
function firePointerCancel(el: HTMLElement, clientX: number) {
  const event = new MouseEvent('pointercancel', { clientX, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  el.dispatchEvent(event);
}

/* ---------- tests ---------- */

describe('BannerCarousel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubPointerCapture();
  });

  afterEach(() => {
    document.head.querySelectorAll('link[rel="preload"][as="image"]').forEach((node) => {
      node.remove();
    });
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

    it('renders the banner through Next image optimization with the raw banner path encoded', () => {
      render(<BannerCarousel banners={[makeBanner(1)]} />);

      expect(screen.getByAltText('Banner 1').getAttribute('src')).toContain(
        encodeURIComponent('/media/banners/banner-1.jpg')
      );
    });

    it('does not emit a Next Image preload tag for banners', () => {
      // The LCP banner is preloaded via the HTTP `Link` response header
      // (configured in `next.config.ts`) — not via a Next Image `priority`
      // preload tag. Emitting one from the component would re-fire on every
      // carousel auto-rotation and trigger "preloaded but not used" warnings.
      document.head.querySelectorAll('link[rel="preload"][as="image"]').forEach((node) => {
        node.remove();
      });

      render(<BannerCarousel banners={[makeBanner(99)]} />);

      expect(screen.getByAltText('Banner 99').getAttribute('src')).toContain(
        encodeURIComponent('/media/banners/banner-99.jpg')
      );

      const preload = document.head.querySelector('link[rel="preload"][as="image"]');
      expect(preload).toBeNull();
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

    it('uses fallback styles when textColor and backgroundColor are null', () => {
      const banner = makeBanner(1, {
        id: 'no-colors',
        content: 'No color strip',
        textColor: null,
        backgroundColor: null,
      });
      render(<BannerCarousel banners={[banner]} />);

      const strip = screen.getByText('No color strip');
      // textColor null → undefined (no color set), backgroundColor null → 'transparent'
      expect(strip.style.color).toBe('');
      expect(strip.style.backgroundColor).toBe('transparent');
    });

    it('applies banner-strip-dark class when isDarkColor returns true', () => {
      mockIsDarkColor.mockReturnValue(true);

      const banner = makeBanner(1, makeNotification('dark', 'Dark strip'));
      render(<BannerCarousel banners={[banner]} />);

      const strip = screen.getByText('Dark strip');
      expect(strip.className).toContain('banner-strip-dark');

      mockIsDarkColor.mockReturnValue(false);
    });

    it('applies banner-strip-dark on outgoing strip during transition', () => {
      mockIsDarkColor.mockReturnValue(true);

      render(<BannerCarousel banners={THREE_BANNERS} />);

      const carousel = screen.getByRole('region', { name: 'Banner carousel' });
      carousel.focus();
      fireEvent.keyDown(carousel, { key: 'ArrowRight' });

      const outgoingStrip = screen.getByText('Notification 1');
      expect(outgoingStrip.className).toContain('banner-strip-dark');

      mockIsDarkColor.mockReturnValue(false);
    });

    it('uses fallback colors on outgoing strip when textColor/backgroundColor are null', () => {
      const nullColorBanners: BannerSlotData[] = [
        makeBanner(1, { id: 'n1', content: 'Null colors', textColor: null, backgroundColor: null }),
        makeBanner(2, makeNotification('n2', 'Next slide')),
      ];
      render(<BannerCarousel banners={nullColorBanners} />);

      const carousel = screen.getByRole('region', { name: 'Banner carousel' });
      carousel.focus();
      fireEvent.keyDown(carousel, { key: 'ArrowRight' });

      // Outgoing strip should use fallback values
      const outgoingStrip = screen.getByText('Null colors');
      expect(outgoingStrip.style.backgroundColor).toBe('transparent');
    });
  });

  /* ---- pointer / swipe navigation ---- */

  describe('pointer / swipe navigation', () => {
    /** Get the track element used for pointer events */
    function getTrack() {
      return document.querySelector('[role="group"]') as HTMLElement;
    }

    /** Mock offsetWidth on the container so width-based calculations work in jsdom */
    function mockContainerWidth(width = 800) {
      const container = document.querySelector('[role="group"]')?.parentElement;
      if (container) {
        Object.defineProperty(container, 'offsetWidth', { value: width, configurable: true });
      }
    }

    it('swipes left (negative deltaX) to navigate to the next slide', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);
      mockContainerWidth();

      const track = getTrack();

      act(() => {
        firePointerDown(track, 300);
        firePointerMove(track, 200);
        firePointerUp(track, 200);
      });

      // incomingIndex is set → incoming notification appears during transition
      expect(screen.getByText('Notification 2')).toBeInTheDocument();
    });

    it('swipes right (positive deltaX) to navigate to the previous slide', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);
      mockContainerWidth();

      const carousel = screen.getByRole('region', { name: 'Banner carousel' });
      carousel.focus();

      // First go to slide 2 via keyboard and complete
      fireEvent.keyDown(carousel, { key: 'ArrowRight' });
      act(() => fireTransitionEnd());

      const track = getTrack();

      // Swipe right to go back
      act(() => {
        firePointerDown(track, 100);
        firePointerMove(track, 250);
        firePointerUp(track, 250);
      });

      expect(screen.getByText('Notification 1')).toBeInTheDocument();
    });

    it('snaps back when swipe does not exceed threshold', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);
      mockContainerWidth();

      const track = getTrack();

      // Small drag that doesn't exceed SWIPE_THRESHOLD (50px)
      act(() => {
        firePointerDown(track, 200);
        firePointerMove(track, 180);
        firePointerUp(track, 180);
      });

      act(() => fireTransitionEnd());

      // Should remain on slide 1
      expect(screen.getByText('Notification 1')).toBeInTheDocument();
    });

    it('applies elastic resistance on large drags', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);
      mockContainerWidth();

      const track = getTrack();

      firePointerDown(track, 500);
      // Move far to simulate elastic resistance (deltaX > width * 0.5)
      firePointerMove(track, 0);

      // Track should have been translated
      expect(track.style.transform).toContain('translateX(');
    });

    it('does not start drag when animating', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);
      mockContainerWidth();

      const carousel = screen.getByRole('region', { name: 'Banner carousel' });
      carousel.focus();

      // Start an animation via keyboard
      fireEvent.keyDown(carousel, { key: 'ArrowRight' });

      const track = getTrack();

      // Try to swipe during animation — should be ignored
      act(() => {
        firePointerDown(track, 300);
        firePointerMove(track, 100);
        firePointerUp(track, 100);
      });

      // Complete the original keyboard animation
      act(() => fireTransitionEnd());

      // Should end up on slide 2 (from keyboard), not slide 3
      expect(screen.getByText('Notification 2')).toBeInTheDocument();
    });

    it('ignores drag on a single banner', () => {
      const banner = makeBanner(1, makeNotification('n1', 'Only one'));
      render(<BannerCarousel banners={[banner]} />);

      const track = getTrack();

      act(() => {
        firePointerDown(track, 300);
        firePointerMove(track, 100);
        firePointerUp(track, 100);
      });

      expect(screen.getByText('Only one')).toBeInTheDocument();
    });

    it('handles pointerCancel like pointerUp', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);
      mockContainerWidth();

      const track = getTrack();

      act(() => {
        firePointerDown(track, 300);
        firePointerMove(track, 280);
        firePointerCancel(track, 280);
      });

      act(() => fireTransitionEnd());

      // Small drag snaps back — still on slide 1
      expect(screen.getByText('Notification 1')).toBeInTheDocument();
    });

    it('ignores pointerMove when not dragging', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const track = getTrack();

      // Move without pointerDown — should be no-op
      firePointerMove(track, 100);

      expect(track.style.transform).toBe('');
    });

    it('ignores pointerUp when not dragging', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);

      const track = getTrack();

      // Up without down — should not crash
      firePointerUp(track, 100);

      expect(screen.getByText('Notification 1')).toBeInTheDocument();
    });

    it('releases pointer but skips navigation when animation starts mid-drag', () => {
      render(<BannerCarousel banners={THREE_BANNERS} />);
      mockContainerWidth();

      const carousel = screen.getByRole('region', { name: 'Banner carousel' });
      const track = getTrack();

      // Start drag
      firePointerDown(track, 300);
      firePointerMove(track, 200);

      // Trigger keyboard animation while dragging — sets isAnimatingRef
      carousel.focus();
      fireEvent.keyDown(carousel, { key: 'ArrowRight' });

      // Release pointer — isDraggingRef is true but isAnimatingRef is also true → early return
      firePointerUp(track, 200);

      // Complete the keyboard animation
      act(() => fireTransitionEnd());

      // Should be on slide 2 from keyboard nav
      expect(screen.getByText('Notification 2')).toBeInTheDocument();
    });

    it('calculates velocity when time elapses between pointerDown and pointerUp', () => {
      // Use a large rotation interval to avoid timer interference
      render(<BannerCarousel banners={THREE_BANNERS} rotationInterval={999} />);
      mockContainerWidth();

      const track = getTrack();

      act(() => {
        firePointerDown(track, 300);
        firePointerMove(track, 240);
        // Advance time so elapsed > 0 in pointerUp velocity calculation
        vi.advanceTimersByTime(50);
        firePointerUp(track, 240);
      });

      // deltaX = -60 exceeds SWIPE_THRESHOLD (50), navigate to next
      expect(screen.getByText('Notification 2')).toBeInTheDocument();
    });
  });

  /* ---- tab visibility ---- */

  describe('tab visibility', () => {
    it('hides notification strip when tab becomes hidden', () => {
      const { container } = render(<BannerCarousel banners={THREE_BANNERS} />);

      // Simulate tab becoming hidden
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      fireEvent(document, new Event('visibilitychange'));

      const stripContainer = container.querySelector(
        '[style*="min-height: 2.5rem"]'
      ) as HTMLElement;
      expect(stripContainer.style.opacity).toBe('0');

      // Restore
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      fireEvent(document, new Event('visibilitychange'));
    });

    it('shows notification strip when tab becomes visible again', () => {
      const { container } = render(<BannerCarousel banners={THREE_BANNERS} />);

      // Hide
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      fireEvent(document, new Event('visibilitychange'));

      // Show again
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      fireEvent(document, new Event('visibilitychange'));

      const stripContainer = container.querySelector(
        '[style*="min-height: 2.5rem"]'
      ) as HTMLElement;
      expect(stripContainer.style.opacity).toBe('1');
    });
  });

  /* ---- auto-rotation timer reset ---- */

  describe('auto-rotation timer interactions', () => {
    it('resets auto-rotation timer on keyboard navigation', () => {
      render(<BannerCarousel banners={THREE_BANNERS} rotationInterval={3} />);

      const carousel = screen.getByRole('region', { name: 'Banner carousel' });
      carousel.focus();

      // Advance 2.5s (not enough to trigger auto-rotation)
      act(() => vi.advanceTimersByTime(2500));

      // Navigate manually — should reset the timer
      fireEvent.keyDown(carousel, { key: 'ArrowRight' });
      act(() => fireTransitionEnd());

      // Advance another 2.5s — should NOT trigger auto-rotation since timer was reset
      act(() => vi.advanceTimersByTime(2500));

      // Should still be on slide 2 (from keyboard nav)
      expect(screen.getByText('Notification 2')).toBeInTheDocument();
    });

    it('resets auto-rotation timer on swipe', () => {
      render(<BannerCarousel banners={THREE_BANNERS} rotationInterval={3} />);

      const track = document.querySelector('[role="group"]') as HTMLElement;
      const container = track?.parentElement;
      if (container) {
        Object.defineProperty(container, 'offsetWidth', { value: 800, configurable: true });
      }

      // Advance 2.5s
      act(() => vi.advanceTimersByTime(2500));

      // Swipe to next slide — resets timer
      act(() => {
        firePointerDown(track, 300);
        firePointerMove(track, 200);
        firePointerUp(track, 200);
      });
      act(() => fireTransitionEnd());

      // Advance 2.5s — timer was reset so no auto-rotation yet
      act(() => vi.advanceTimersByTime(2500));

      expect(screen.getByText('Notification 2')).toBeInTheDocument();
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
