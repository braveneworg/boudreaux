// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, render, screen } from '@testing-library/react';

import { BannerNotificationTicker } from './banner-notification-ticker';

import type { BannerSlotData } from './banner-carousel';

// Mock the presentational strip so these tests focus on the ticker's rotation
// state machine, surfacing the props it drives as data attributes.
vi.mock('./banner-notification-strip', () => ({
  BannerNotificationStrip: (props: {
    active: { content: string } | null;
    outgoing: { content: string } | null;
    isTransitioning: boolean;
    size?: string;
  }) => (
    <div
      data-testid="strip"
      data-active={props.active?.content ?? ''}
      data-outgoing={props.outgoing?.content ?? ''}
      data-transitioning={String(props.isTransitioning)}
      data-size={props.size}
    />
  ),
}));

function bannerWith(slot: number, content: string | null): BannerSlotData {
  return {
    slotNumber: slot,
    imageFilename: `banner-${slot}.jpg`,
    notification:
      content === null
        ? null
        : { id: `n${slot}`, content, textColor: '#fff', backgroundColor: '#000' },
  };
}

const TWO_NOTIFS: BannerSlotData[] = [bannerWith(1, 'First'), bannerWith(2, 'Second')];

describe('BannerNotificationTicker', () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  it('renders nothing when no banner carries a notification', () => {
    const { container } = render(
      <BannerNotificationTicker banners={[bannerWith(1, null), bannerWith(2, null)]} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the first notification at the larger desktop size, not transitioning', () => {
    render(<BannerNotificationTicker banners={TWO_NOTIFS} />);

    const strip = screen.getByTestId('strip');
    expect(strip).toHaveAttribute('data-active', 'First');
    expect(strip).toHaveAttribute('data-transitioning', 'false');
    expect(strip).toHaveAttribute('data-size', 'lg');
  });

  it('slides the next notification in from the left after the rotation interval', () => {
    vi.useFakeTimers();
    render(<BannerNotificationTicker banners={TWO_NOTIFS} rotationInterval={5} />);

    // Tick the rotation interval: the next notification stages as "incoming"
    // (transitioning) while the previous one becomes the outgoing strip.
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    const midSwap = screen.getByTestId('strip');
    expect(midSwap).toHaveAttribute('data-transitioning', 'true');
    expect(midSwap).toHaveAttribute('data-active', 'Second');
    expect(midSwap).toHaveAttribute('data-outgoing', 'First');

    // Once the slide animation finishes, it settles on the new notification.
    act(() => {
      vi.advanceTimersByTime(400);
    });

    const settled = screen.getByTestId('strip');
    expect(settled).toHaveAttribute('data-transitioning', 'false');
    expect(settled).toHaveAttribute('data-active', 'Second');
  });

  it('wraps back to the first notification after the last', () => {
    vi.useFakeTimers();
    render(<BannerNotificationTicker banners={TWO_NOTIFS} rotationInterval={5} />);

    // First → Second
    act(() => vi.advanceTimersByTime(5000));
    act(() => vi.advanceTimersByTime(400));
    // Second → First (wrap)
    act(() => vi.advanceTimersByTime(5000));
    act(() => vi.advanceTimersByTime(400));

    expect(screen.getByTestId('strip')).toHaveAttribute('data-active', 'First');
  });

  it('does not rotate when there is only a single notification', () => {
    vi.useFakeTimers();
    render(<BannerNotificationTicker banners={[bannerWith(1, 'Solo'), bannerWith(2, null)]} />);

    act(() => vi.advanceTimersByTime(60_000));

    const strip = screen.getByTestId('strip');
    expect(strip).toHaveAttribute('data-active', 'Solo');
    expect(strip).toHaveAttribute('data-transitioning', 'false');
  });

  it('pauses rotation while the tab is hidden', () => {
    vi.useFakeTimers();
    render(<BannerNotificationTicker banners={TWO_NOTIFS} rotationInterval={5} />);

    act(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    act(() => vi.advanceTimersByTime(20_000));

    // Still on the first notification — no rotation happened while hidden.
    expect(screen.getByTestId('strip')).toHaveAttribute('data-active', 'First');
  });
});
