/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DeepLinkPlayDialog, type DeepLinkRelease } from './deep-link-play-dialog';

const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

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

// The listening modal is real; only its external edges are stood in for: the
// release detail fetch, the video.js player and the lazily-loaded social links.
vi.mock('@/hooks/queries/use-release-query', () => ({
  useReleaseQuery: () => ({
    isPending: false,
    isError: false,
    data: { id: '0123456789abcdef01234567', title: 'E2E Album One' },
  }),
}));

vi.mock('./release-player', () => ({
  ReleasePlayer: ({ autoPlay }: { autoPlay: boolean }) => (
    <div data-testid="release-player" data-autoplay={String(autoPlay)} />
  ),
}));

vi.mock('./social-share-widget', () => ({
  SocialShareWidget: ({ url }: { url: string }) => (
    <div data-testid="social-share-widget" data-url={url} />
  ),
}));

const RELEASE: DeepLinkRelease = {
  id: '0123456789abcdef01234567',
  title: 'E2E Album One',
  artistName: 'E2E Artist',
  playSrc: 'https://cdn.example/track-1.mp3',
  year: 2024,
};

const renderDialog = () => {
  render(<DeepLinkPlayDialog release={RELEASE} artistSlug="e2e-artist" />);
  return userEvent.setup({ delay: null });
};

const dialog = (): HTMLElement => screen.getByRole('dialog');

describe('DeepLinkPlayDialog', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'https://fakefour.test');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the release on arrival, the artist leading the heading and the year after the title', () => {
    renderDialog();

    expect(dialog()).toHaveAccessibleName('E2E Artist');
    expect(dialog()).toHaveAccessibleDescription('E2E Album One (2024)');
  });

  it('opens unprimed and paused: there was no gesture to play from', () => {
    renderDialog();

    expect(screen.getByTestId('release-player')).toHaveAttribute('data-autoplay', 'false');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('slides up as a sheet on phones', () => {
    renderDialog();

    expect(dialog()).toHaveClass('max-sm:bottom-0');
  });

  it('shares the release deep link', async () => {
    renderDialog();

    expect(await screen.findByTestId('social-share-widget')).toHaveAttribute(
      'data-url',
      `https://fakefour.test/releases?artist=e2e-artist&release=${RELEASE.id}`
    );
  });

  it("drops the release from the URL on close, so back or refresh doesn't reopen it", async () => {
    const user = renderDialog();

    await user.click(within(dialog()).getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(replace.mock.calls).toEqual([['/releases?artist=e2e-artist', { scroll: false }]]);
  });

  it("links to the artist's releases under the player", () => {
    renderDialog();

    expect(within(dialog()).getByRole('link', { name: 'View all releases' })).toHaveAttribute(
      'href',
      '/releases?artist=e2e-artist'
    );
  });

  it('closes onto the listing from "View all releases" on a plain click', async () => {
    const user = renderDialog();

    await user.click(within(dialog()).getByRole('link', { name: 'View all releases' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(replace.mock.calls).toEqual([['/releases?artist=e2e-artist', { scroll: false }]]);
  });

  it('leaves a modified click on "View all releases" to the browser', () => {
    renderDialog();

    const link = within(dialog()).getByRole('link', { name: 'View all releases' });
    const notCanceled = fireEvent.click(link, { metaKey: true });

    expect(notCanceled).toBe(true);
    expect(dialog()).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
