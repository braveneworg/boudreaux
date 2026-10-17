/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen } from '@testing-library/react';

import { ReleaseShareWidget } from './release-share-widget';

const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('lucide-react', () => ({
  Share2Icon: (props: React.HTMLAttributes<HTMLButtonElement>) => (
    <button type="button" data-testid="share2-icon" onClick={props.onClick} />
  ),
}));

vi.mock('sonner', () => ({
  toast: mockToast,
}));

vi.mock('./social-share-widget', () => ({
  SocialShareWidget: ({ artistUrl, url }: { artistUrl?: string; url?: string }) => (
    <div data-testid="social-share-widget" data-url={url ?? artistUrl} />
  ),
}));

const BASE_URL = 'https://fakefour.test';

const defaultProps = {
  artistSlug: 'spot-artist',
  artistName: 'Spot Artist',
  releaseTitle: 'Spot Album',
};

const stubShare = (share: ((data: ShareData) => Promise<void>) | undefined): void => {
  Object.defineProperty(navigator, 'share', { value: share, writable: true, configurable: true });
};

const stubClipboard = (writeText: (text: string) => Promise<void>): void => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    writable: true,
    configurable: true,
  });
};

describe('ReleaseShareWidget', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', BASE_URL);
  });

  it('renders a separator', () => {
    const { container } = render(<ReleaseShareWidget {...defaultProps} />);

    expect(container.querySelector('[data-slot="separator"]')).toBeInTheDocument();
  });

  it('renders the Share2Icon', () => {
    render(<ReleaseShareWidget {...defaultProps} />);

    expect(screen.getByTestId('share2-icon')).toBeInTheDocument();
  });

  it("shares the artist's page through the social links", async () => {
    render(<ReleaseShareWidget {...defaultProps} />);

    // SocialShareWidget is a next/dynamic import that resolves asynchronously.
    expect(await screen.findByTestId('social-share-widget')).toHaveAttribute(
      'data-url',
      `${BASE_URL}/artists/spot-artist`
    );
  });

  it('falls back to the production host when no host name is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', undefined);

    render(<ReleaseShareWidget {...defaultProps} />);

    expect(await screen.findByTestId('social-share-widget')).toHaveAttribute(
      'data-url',
      'https://fakefourrecords.com/artists/spot-artist'
    );
  });

  it('shares the site when there is no artist page', async () => {
    render(<ReleaseShareWidget {...defaultProps} artistSlug={null} />);

    expect(await screen.findByTestId('social-share-widget')).toHaveAttribute('data-url', BASE_URL);
  });

  it('shares the release title and artist through navigator.share', () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubShare(share);

    render(<ReleaseShareWidget {...defaultProps} />);
    fireEvent.click(screen.getByTestId('share2-icon'));

    expect(share.mock.calls).toEqual([
      [
        {
          title: 'Spot Album',
          text: 'Check out Spot Artist on Fake Four Inc.!',
          url: `${BASE_URL}/artists/spot-artist`,
        },
      ],
    ]);
  });

  it('names the release when there is no artist name', () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubShare(share);

    render(<ReleaseShareWidget {...defaultProps} artistName={null} />);
    fireEvent.click(screen.getByTestId('share2-icon'));

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Check out Spot Album on Fake Four Inc.!' })
    );
  });

  it('copies the artist link when navigator.share is not available', () => {
    stubShare(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(<ReleaseShareWidget {...defaultProps} />);
    fireEvent.click(screen.getByTestId('share2-icon'));

    expect(writeText.mock.calls).toEqual([[`${BASE_URL}/artists/spot-artist`]]);
  });

  it('confirms a copied link', async () => {
    stubShare(undefined);
    stubClipboard(vi.fn().mockResolvedValue(undefined));

    render(<ReleaseShareWidget {...defaultProps} />);
    fireEvent.click(screen.getByTestId('share2-icon'));

    await vi.waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Link copied');
    });
  });

  describe('with a share URL', () => {
    const SHARE_URL = `${BASE_URL}/releases?artist=spot-artist&release=0123456789abcdef01234567`;

    it('shares that URL through the social links', async () => {
      render(<ReleaseShareWidget {...defaultProps} shareUrl={SHARE_URL} />);

      expect(await screen.findByTestId('social-share-widget')).toHaveAttribute(
        'data-url',
        SHARE_URL
      );
    });

    it('shares that URL through navigator.share', () => {
      const share = vi.fn().mockResolvedValue(undefined);
      stubShare(share);

      render(<ReleaseShareWidget {...defaultProps} shareUrl={SHARE_URL} />);
      fireEvent.click(screen.getByTestId('share2-icon'));

      expect(share.mock.calls).toEqual([
        [
          {
            title: 'Spot Album',
            text: 'Check out Spot Artist on Fake Four Inc.!',
            url: SHARE_URL,
          },
        ],
      ]);
    });

    it('copies that URL when navigator.share is not available', () => {
      stubShare(undefined);
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);

      render(<ReleaseShareWidget {...defaultProps} shareUrl={SHARE_URL} />);
      fireEvent.click(screen.getByTestId('share2-icon'));

      expect(writeText.mock.calls).toEqual([[SHARE_URL]]);
    });
  });

  it('shows a success toast when the share succeeds', async () => {
    stubShare(vi.fn().mockResolvedValue(undefined));

    render(<ReleaseShareWidget {...defaultProps} />);
    fireEvent.click(screen.getByTestId('share2-icon'));

    await vi.waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Content shared successfully!');
    });
  });

  it('shows an error toast when the share fails', async () => {
    stubShare(vi.fn().mockRejectedValue(new Error('Share failed')));

    render(<ReleaseShareWidget {...defaultProps} />);
    fireEvent.click(screen.getByTestId('share2-icon'));

    await vi.waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Error sharing content');
    });
  });

  it('shows an error toast when the clipboard write fails', async () => {
    stubShare(undefined);
    stubClipboard(vi.fn().mockRejectedValue(new Error('Clipboard write failed')));

    render(<ReleaseShareWidget {...defaultProps} />);
    fireEvent.click(screen.getByTestId('share2-icon'));

    await vi.waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to copy link to clipboard');
    });
  });

  it('shows no error when the user cancels the share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Share canceled', 'AbortError'));
    stubShare(share);

    render(<ReleaseShareWidget {...defaultProps} />);
    fireEvent.click(screen.getByTestId('share2-icon'));

    await vi.waitFor(() => {
      expect(share).toHaveBeenCalled();
    });
    expect(mockToast.error).not.toHaveBeenCalled();
  });
});
