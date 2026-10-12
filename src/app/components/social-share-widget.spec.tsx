/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { SocialShareWidget } from './social-share-widget';

type IconMockProps = {
  size: number;
  bgStyle?: { fill?: string };
  className?: string;
  'aria-hidden'?: boolean;
};

type ButtonMockProps = {
  children: React.ReactNode;
  url: string;
  title?: string;
  appId?: string;
  className?: string;
  'aria-label'?: string;
};

vi.mock('react-share', () => {
  // Echo the size, the gray fill override and the classes so the layers can
  // be asserted; the brand layer is a second icon with no bgStyle.
  const icon =
    (testId: string) =>
    ({ size, bgStyle, className, ...props }: IconMockProps) => (
      <span
        data-testid={testId}
        data-size={size}
        data-bg-fill={bgStyle?.fill}
        className={className}
        aria-hidden={props['aria-hidden']}
      />
    );
  const button = ({ children, url, title, appId, className, ...props }: ButtonMockProps) => (
    <button
      data-url={url}
      data-title={title}
      data-app-id={appId}
      className={className}
      aria-label={props['aria-label']}
    >
      {children}
    </button>
  );
  return {
    FacebookIcon: icon('facebook-icon'),
    FacebookMessengerIcon: icon('messenger-icon'),
    FacebookMessengerShareButton: button,
    FacebookShareButton: button,
    TelegramIcon: icon('telegram-icon'),
    TelegramShareButton: button,
    WhatsappIcon: icon('whatsapp-icon'),
    WhatsappShareButton: button,
    XIcon: icon('x-icon'),
    XShareButton: button,
  };
});

vi.mock('lucide-react', () => ({
  MessageSquareIcon: ({ size, ...props }: { size: number } & Record<string, unknown>) => (
    <span data-testid="message-square-icon" data-size={size} {...props} />
  ),
}));

const TEST_URL = 'https://fakefourinc.com/artists/test-artist';
const SHARE_TITLE = 'Check this out on Fake Four Inc.!';

describe('SocialShareWidget', () => {
  describe('rendering all share buttons', () => {
    it('renders the Facebook share button', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share on Facebook')).toBeInTheDocument();
    });

    it('renders the Messenger share button', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share on Messenger')).toBeInTheDocument();
    });

    it('renders the WhatsApp share button', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share on WhatsApp')).toBeInTheDocument();
    });

    it('renders the SMS share link', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share via SMS')).toBeInTheDocument();
    });

    it('renders the Telegram share button', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share on Telegram')).toBeInTheDocument();
    });

    it('renders the WeChat share link', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('微信 — Share on WeChat (scan QR code)')).toBeInTheDocument();
    });

    it('renders the X share button', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share on X')).toBeInTheDocument();
    });
  });

  describe('url prop forwarding', () => {
    it('passes the correct url to the Facebook share button', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share on Facebook')).toHaveAttribute('data-url', TEST_URL);
    });

    it('passes the correct url to the Messenger share button', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share on Messenger')).toHaveAttribute('data-url', TEST_URL);
    });

    it('passes the correct url to the WhatsApp share button', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share on WhatsApp')).toHaveAttribute('data-url', TEST_URL);
    });

    it('passes the correct url to the Telegram share button', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share on Telegram')).toHaveAttribute('data-url', TEST_URL);
    });

    it('passes the correct url to the X share button', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share on X')).toHaveAttribute('data-url', TEST_URL);
    });
  });

  describe('neutral url prop', () => {
    it('prefers the neutral url prop over artistUrl', () => {
      render(<SocialShareWidget url="https://example.com/playlists/pl-1" artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share via SMS')).toHaveAttribute(
        'href',
        expect.stringContaining(encodeURIComponent('https://example.com/playlists/pl-1'))
      );
    });

    it('degrades to an empty share url when neither prop is passed', () => {
      render(<SocialShareWidget />);

      expect(screen.getByLabelText('Share via SMS')).toBeInTheDocument();
    });
  });

  describe('SMS link', () => {
    it('has the correct href with encoded body containing the share title and url', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      const smsLink = screen.getByLabelText('Share via SMS');
      const expectedHref = `sms:?&body=${encodeURIComponent(`${SHARE_TITLE} ${TEST_URL}`)}`;

      expect(smsLink).toHaveAttribute('href', expectedHref);
    });
  });

  describe('WeChat link', () => {
    it('leads the accessible name with the visible 微信 text', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      // label-content-name-mismatch (WCAG 2.5.3): speech-input users say the
      // visible label — the accessible name must contain it, ideally first.
      const wechatLink = screen.getByRole('link', { name: /^微信/ });

      expect(wechatLink).toHaveTextContent('微信');
    });

    it('has the correct QR code href with encoded url', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      const wechatLink = screen.getByLabelText('微信 — Share on WeChat (scan QR code)');
      const expectedHref = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(TEST_URL)}`;

      expect(wechatLink).toHaveAttribute('href', expectedHref);
    });

    it('opens in a new tab with target="_blank"', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      const wechatLink = screen.getByLabelText('微信 — Share on WeChat (scan QR code)');

      expect(wechatLink).toHaveAttribute('target', '_blank');
    });

    it('has rel="noopener noreferrer" for security', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      const wechatLink = screen.getByLabelText('微信 — Share on WeChat (scan QR code)');

      expect(wechatLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('facebookMessengerAppId prop', () => {
    it('uses an empty string as the default facebookMessengerAppId', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      const messengerButton = screen.getByLabelText('Share on Messenger');

      expect(messengerButton).toHaveAttribute('data-app-id', '');
    });

    it('uses a custom facebookMessengerAppId when provided', () => {
      const customAppId = '123456789';

      render(<SocialShareWidget artistUrl={TEST_URL} facebookMessengerAppId={customAppId} />);

      const messengerButton = screen.getByLabelText('Share on Messenger');

      expect(messengerButton).toHaveAttribute('data-app-id', customAppId);
    });
  });

  describe('gray at rest, brand on interaction', () => {
    const CONTROLS = [
      'Share on Facebook',
      'Share on Messenger',
      'Share on WhatsApp',
      'Share via SMS',
      'Share on Telegram',
      '微信 — Share on WeChat (scan QR code)',
      'Share on X',
    ];

    const layer = (control: HTMLElement, name: 'gray' | 'brand'): Element | null =>
      control.querySelector(`[data-share-layer="${name}"]`);

    it.each(CONTROLS)('makes %s the group its layers react to', (label) => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText(label)).toHaveClass('group');
    });

    it.each(CONTROLS)('stacks a gray layer and a brand layer in %s', (label) => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);
      const control = screen.getByLabelText(label);

      expect(layer(control, 'gray')).not.toBeNull();
      expect(layer(control, 'brand')).not.toBeNull();
    });

    it.each(CONTROLS)('hides the brand layer of %s until hover, focus or press', (label) => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);
      const brand = layer(screen.getByLabelText(label), 'brand');

      expect(brand).toHaveClass(
        'absolute',
        'opacity-0',
        'group-hover:opacity-100',
        'group-focus-visible:opacity-100',
        'group-active:opacity-100',
        'transition-opacity'
      );
      expect(brand).toHaveAttribute('aria-hidden', 'true');
    });

    it.each([
      ['facebook-icon', '#3f3f46'],
      ['messenger-icon', '#52525b'],
      ['whatsapp-icon', '#71717a'],
      ['telegram-icon', '#52525b'],
      ['x-icon', '#27272a'],
    ])('fills the gray %s with its zinc shade', (testId, fill) => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);
      const [gray, brand] = screen.getAllByTestId(testId);

      expect(gray).toHaveAttribute('data-bg-fill', fill);
      // The brand layer keeps react-share's own network color.
      expect(brand).not.toHaveAttribute('data-bg-fill');
    });

    it.each(['Share via SMS', '微信 — Share on WeChat (scan QR code)'])(
      'gives the %s gray layer a zinc-700 background',
      (label) => {
        render(<SocialShareWidget artistUrl={TEST_URL} />);
        const gray = layer(screen.getByLabelText(label), 'gray');

        expect(gray?.firstElementChild).toHaveClass('bg-zinc-700');
      }
    );

    it('sets no inline size on the SMS link', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      expect(screen.getByLabelText('Share via SMS')).not.toHaveAttribute('style');
    });
  });
});
