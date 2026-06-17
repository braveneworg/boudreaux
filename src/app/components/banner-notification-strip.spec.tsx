// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import { isDarkColor } from '@/lib/utils/color';

import { BannerNotificationStrip, type BannerNotification } from './banner-notification-strip';

const mockIsDarkColor = vi.mocked(isDarkColor);

vi.mock('@/lib/utils/color', () => ({
  isDarkColor: vi.fn(() => false),
}));

vi.mock('@/lib/validation/banner-notification-schema', () => ({
  sanitizeNotificationHtml: (html: string) => html,
  addLinkAttributes: (html: string) => html,
}));

const makeNotification = (overrides: Partial<BannerNotification> = {}): BannerNotification => ({
  id: 'n1',
  content: 'Hello world',
  textColor: '#fff',
  backgroundColor: '#000',
  ...overrides,
});

const baseProps = {
  outgoing: null,
  isTransitioning: false,
  visible: true,
  transitionDurationMs: 400,
  easing: 'ease',
  activeKey: 'a',
  outgoingKey: 'o',
} as const;

describe('BannerNotificationStrip', () => {
  beforeEach(() => {
    mockIsDarkColor.mockReturnValue(false);
  });

  it('renders the active notification content', () => {
    render(
      <BannerNotificationStrip
        {...baseProps}
        active={makeNotification({ content: 'Promo time' })}
      />
    );

    expect(document.body).toHaveTextContent('Promo time');
  });

  it('applies the author colors to the active strip', () => {
    const { container } = render(
      <BannerNotificationStrip
        {...baseProps}
        active={makeNotification({ textColor: '#abcdef', backgroundColor: '#123456' })}
      />
    );

    const strip = container.querySelector('[style*="background-color"]');
    expect(strip).toHaveStyle({ color: '#abcdef', backgroundColor: '#123456' });
  });

  it('uses the dark link styling when the background is dark', () => {
    mockIsDarkColor.mockReturnValue(true);
    const { container } = render(
      <BannerNotificationStrip {...baseProps} active={makeNotification()} />
    );

    expect(container.querySelector('.banner-strip-dark')).toBeInTheDocument();
    expect(container.querySelector('.banner-strip-light')).not.toBeInTheDocument();
  });

  it('uses the light link styling when the background is light', () => {
    mockIsDarkColor.mockReturnValue(false);
    const { container } = render(
      <BannerNotificationStrip {...baseProps} active={makeNotification()} />
    );

    expect(container.querySelector('.banner-strip-light')).toBeInTheDocument();
  });

  it('does not render the outgoing strip when not transitioning', () => {
    render(
      <BannerNotificationStrip
        {...baseProps}
        active={makeNotification({ content: 'Current' })}
        outgoing={makeNotification({ id: 'n0', content: 'Previous' })}
        isTransitioning={false}
      />
    );

    expect(document.body).toHaveTextContent('Current');
    expect(document.body).not.toHaveTextContent('Previous');
  });

  it('renders both strips during a transition with their slide animations', () => {
    const { container } = render(
      <BannerNotificationStrip
        {...baseProps}
        active={makeNotification({ id: 'n1', content: 'Incoming' })}
        outgoing={makeNotification({ id: 'n0', content: 'Outgoing' })}
        isTransitioning
      />
    );

    expect(document.body).toHaveTextContent('Incoming');
    expect(document.body).toHaveTextContent('Outgoing');
    // Outgoing exits to the right; incoming slides in from the left.
    expect(container.querySelector('[style*="banner-strip-exit-right"]')).toBeInTheDocument();
    expect(container.querySelector('[style*="banner-strip-slide-right"]')).toBeInTheDocument();
  });

  it('fades the container out when not visible', () => {
    const { container } = render(
      <BannerNotificationStrip {...baseProps} active={makeNotification()} visible={false} />
    );

    expect(container.firstChild).toHaveStyle({ opacity: '0' });
  });

  it('keeps the container mounted (reserving height) even with no notification', () => {
    const { container } = render(
      <BannerNotificationStrip {...baseProps} active={null} visible={false} />
    );

    // The outer container is always present so toggling a notification never
    // shifts layout; the default size reserves 2.5rem.
    expect(container.firstChild).toHaveStyle({ minHeight: '2.5rem' });
  });

  it('uses the taller, larger-font body for the lg (desktop) size', () => {
    const { container } = render(
      <BannerNotificationStrip {...baseProps} active={makeNotification()} size="lg" />
    );

    expect(container.firstChild).toHaveStyle({ minHeight: '3.25rem' });
    const body = container.querySelector('.text-base');
    expect(body).toBeInTheDocument();
    expect(body).toHaveClass('py-3', 'px-6');
  });

  it('uses the smaller default body when no size is given', () => {
    const { container } = render(
      <BannerNotificationStrip {...baseProps} active={makeNotification()} />
    );

    expect(container.firstChild).toHaveStyle({ minHeight: '2.5rem' });
    expect(container.querySelector('.text-sm')).toBeInTheDocument();
  });
});
