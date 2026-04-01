/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { SocialShareWidget } from './social-share-widget';

vi.mock('react-share', () => ({
  FacebookIcon: ({ size, ...props }: { size: number } & Record<string, unknown>) => (
    <span data-testid="facebook-icon" data-size={size} {...props} />
  ),
  FacebookMessengerIcon: ({ size, ...props }: { size: number } & Record<string, unknown>) => (
    <span data-testid="messenger-icon" data-size={size} {...props} />
  ),
  FacebookMessengerShareButton: ({
    children,
    url,
    appId,
    ...props
  }: {
    children: React.ReactNode;
    url: string;
    appId: string;
  } & Record<string, unknown>) => (
    <button data-url={url} data-app-id={appId} aria-label={props['aria-label'] as string}>
      {children}
    </button>
  ),
  FacebookShareButton: ({
    children,
    url,
    ...props
  }: {
    children: React.ReactNode;
    url: string;
  } & Record<string, unknown>) => (
    <button data-url={url} aria-label={props['aria-label'] as string}>
      {children}
    </button>
  ),
  TelegramIcon: ({ size, ...props }: { size: number } & Record<string, unknown>) => (
    <span data-testid="telegram-icon" data-size={size} {...props} />
  ),
  TelegramShareButton: ({
    children,
    url,
    title,
    ...props
  }: {
    children: React.ReactNode;
    url: string;
    title: string;
  } & Record<string, unknown>) => (
    <button data-url={url} data-title={title} aria-label={props['aria-label'] as string}>
      {children}
    </button>
  ),
  WhatsappIcon: ({ size, ...props }: { size: number } & Record<string, unknown>) => (
    <span data-testid="whatsapp-icon" data-size={size} {...props} />
  ),
  WhatsappShareButton: ({
    children,
    url,
    title,
    ...props
  }: {
    children: React.ReactNode;
    url: string;
    title: string;
  } & Record<string, unknown>) => (
    <button data-url={url} data-title={title} aria-label={props['aria-label'] as string}>
      {children}
    </button>
  ),
  XIcon: ({ size, ...props }: { size: number } & Record<string, unknown>) => (
    <span data-testid="x-icon" data-size={size} {...props} />
  ),
  XShareButton: ({
    children,
    url,
    title,
    ...props
  }: {
    children: React.ReactNode;
    url: string;
    title: string;
  } & Record<string, unknown>) => (
    <button data-url={url} data-title={title} aria-label={props['aria-label'] as string}>
      {children}
    </button>
  ),
}));

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

      expect(screen.getByLabelText('Share on WeChat')).toBeInTheDocument();
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

  describe('SMS link', () => {
    it('has the correct href with encoded body containing the share title and url', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      const smsLink = screen.getByLabelText('Share via SMS');
      const expectedHref = `sms:?&body=${encodeURIComponent(`${SHARE_TITLE} ${TEST_URL}`)}`;

      expect(smsLink).toHaveAttribute('href', expectedHref);
    });
  });

  describe('WeChat link', () => {
    it('has the correct QR code href with encoded url', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      const wechatLink = screen.getByLabelText('Share on WeChat');
      const expectedHref = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(TEST_URL)}`;

      expect(wechatLink).toHaveAttribute('href', expectedHref);
    });

    it('opens in a new tab with target="_blank"', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      const wechatLink = screen.getByLabelText('Share on WeChat');

      expect(wechatLink).toHaveAttribute('target', '_blank');
    });

    it('has rel="noopener noreferrer" for security', () => {
      render(<SocialShareWidget artistUrl={TEST_URL} />);

      const wechatLink = screen.getByLabelText('Share on WeChat');

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
});
