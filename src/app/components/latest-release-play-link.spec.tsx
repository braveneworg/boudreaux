/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { zineAccentForRelease } from '@/app/components/ui/zine-panel';

import { LatestReleasePlayLink, type LatestRelease } from './latest-release-play-link';

import type { ReleasePlayDialogProps } from './release-play-dialog';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('next/link', () => ({
  default: ({
    href,
    prefetch,
    children,
    ...rest
  }: {
    href: string;
    prefetch?: boolean;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

const hydrated = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => hydrated.value }));

const dialog = vi.hoisted(() => ({
  playerOpen: false,
  openPlayer: vi.fn(),
  handlePlayerOpenChange: vi.fn(),
  warmPlayer: vi.fn(),
  takeMediaEl: vi.fn(() => null),
}));
vi.mock('@/hooks/use-release-play-dialog', () => ({
  useReleasePlayDialog: () => ({ ...dialog, prefetchPlayer: false }),
}));

const dialogProps = vi.hoisted(() => ({ current: null as ReleasePlayDialogProps | null }));
vi.mock('./release-play-dialog', () => ({
  ReleasePlayDialog: (props: ReleasePlayDialogProps) => {
    dialogProps.current = props;
    return props.open ? (
      <div role="dialog" aria-label="player">
        {props.shareWidget}
        {props.footer}
        <button type="button" onClick={() => props.onCloseAutoFocus?.(new Event('focus'))}>
          close-focus
        </button>
      </div>
    ) : null;
  },
}));

vi.mock('./release-share-widget', () => ({
  ReleaseShareWidget: ({ shareUrl, artistSlug }: { shareUrl?: string; artistSlug: string }) => (
    <div data-testid="share-widget" data-share-url={shareUrl} data-artist-slug={artistSlug} />
  ),
}));

const RELEASE_ID = '0123456789abcdef01234567';
const DEEP_LINK = `/releases?artist=marguerite-ash&release=${RELEASE_ID}`;

const playable: LatestRelease = {
  id: RELEASE_ID,
  title: 'Night Shift',
  releasedOn: new Date('2024-09-30T23:30:00.000Z'),
  playSrc: 'https://cdn.example/track-1.mp3',
  byName: null,
  albumArtistSlug: 'marguerite-ash',
};

const renderLink = (release: Partial<LatestRelease> = {}, variant: 'page' | 'card' = 'page') => {
  render(
    <div data-testid="line">
      <LatestReleasePlayLink
        release={{ ...playable, ...release }}
        artistName="Marguerite Ash"
        slug="marguerite-ash"
        variant={variant}
      />
    </div>
  );
  return userEvent.setup({ delay: null });
};

const props = (): ReleasePlayDialogProps => {
  if (!dialogProps.current) throw new Error('ReleasePlayDialog was not rendered');
  return dialogProps.current;
};

describe('LatestReleasePlayLink', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'https://fakefour.test');
    hydrated.value = true;
    dialog.playerOpen = false;
    dialogProps.current = null;
  });

  describe('page variant', () => {
    it('links the title to the release deep link with the UTC year', () => {
      renderLink();

      const link = screen.getByRole('link', { name: 'Night Shift' });
      expect(link).toHaveAttribute('href', DEEP_LINK);
      expect(link).toHaveAttribute('data-prefetch', 'false');
      expect(link.parentElement).toHaveTextContent('Latest Release: Night Shift (2024)');
    });

    it('labels the line, keeping the label out of the link', () => {
      renderLink();

      const label = screen.getByText('Latest Release:');
      expect(label.closest('a')).toBeNull();
      expect(label.parentElement).toContainElement(
        screen.getByRole('link', { name: 'Night Shift' })
      );
    });

    it('names the album artist when this artist is only featured', () => {
      renderLink({ byName: 'Ceschi', albumArtistSlug: 'ceschi' });

      expect(screen.getByRole('link', { name: 'Night Shift' }).parentElement).toHaveTextContent(
        'Latest Release: Night Shift by Ceschi (2024)'
      );
    });

    it('offers every release beneath the line, with an eye icon ahead of the words', () => {
      renderLink();

      const link = screen.getByRole('link', { name: 'View all releases' });
      expect(link).toHaveAttribute('href', '/releases?artist=marguerite-ash');
      const icon = link.querySelector('svg');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon?.nextSibling).toHaveTextContent('View all releases');
    });

    it('shows the title as plain text when nothing is playable', () => {
      renderLink({ playSrc: null });

      expect(screen.queryByRole('link', { name: 'Night Shift' })).not.toBeInTheDocument();
      expect(screen.getByText('Night Shift')).toBeInTheDocument();
      expect(screen.getByText('Latest Release:').parentElement).toHaveTextContent(
        'Latest Release: Night Shift (2024)'
      );
      expect(dialogProps.current).toBeNull();
    });
  });

  describe('card variant', () => {
    it('reads "Latest: title (year)", the title linking to the deep link', () => {
      renderLink({}, 'card');

      expect(screen.getByTestId('line')).toHaveTextContent('Latest: Night Shift (2024)');
      expect(screen.getByRole('link', { name: 'Night Shift' })).toHaveAttribute('href', DEEP_LINK);
    });

    it('has no line of its own for every release', () => {
      renderLink({}, 'card');

      expect(screen.queryByRole('link', { name: 'View all releases' })).not.toBeInTheDocument();
    });

    it('shows the title as plain text when nothing is playable', () => {
      renderLink({ playSrc: null }, 'card');

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByTestId('line')).toHaveTextContent('Latest: Night Shift (2024)');
    });
  });

  it("links to the album artist's deep link when this artist is only featured", () => {
    renderLink({ byName: 'Ceschi', albumArtistSlug: 'ceschi' });

    expect(screen.getByRole('link', { name: 'Night Shift' })).toHaveAttribute(
      'href',
      `/releases?artist=ceschi&release=${RELEASE_ID}`
    );
  });

  it("links to this artist's deep link when the album artist is hidden", () => {
    renderLink({ albumArtistSlug: null });

    expect(screen.getByRole('link', { name: 'Night Shift' })).toHaveAttribute('href', DEEP_LINK);
  });

  it('announces the dialog once hydrated, when the release is playable', () => {
    renderLink();

    expect(screen.getByRole('link', { name: 'Night Shift' })).toHaveAttribute(
      'aria-haspopup',
      'dialog'
    );
  });

  it('is a plain link before hydration, so the server markup matches', () => {
    hydrated.value = false;
    renderLink();

    expect(screen.getByRole('link', { name: 'Night Shift' })).not.toHaveAttribute('aria-haspopup');
  });

  it('opens the player on a plain left click instead of navigating', async () => {
    const user = renderLink();

    await user.click(screen.getByRole('link', { name: 'Night Shift' }));

    expect(dialog.openPlayer).toHaveBeenCalledTimes(1);
  });

  it('leaves a modified click to the browser', async () => {
    const user = renderLink();

    await user.keyboard('{Meta>}');
    await user.click(screen.getByRole('link', { name: 'Night Shift' }));
    await user.keyboard('{/Meta}');

    expect(dialog.openPlayer).not.toHaveBeenCalled();
  });

  it('warms the player when the link is hovered or focused', async () => {
    const user = renderLink();

    await user.hover(screen.getByRole('link', { name: 'Night Shift' }));
    screen.getByRole('link', { name: 'Night Shift' }).focus();

    expect(dialog.warmPlayer).toHaveBeenCalled();
  });

  it("frames the modal in the release's own accent, naming the album artist", () => {
    renderLink({ byName: 'Ceschi', albumArtistSlug: 'ceschi' });

    expect(props()).toMatchObject({
      releaseId: RELEASE_ID,
      title: 'Night Shift',
      artistName: 'Ceschi',
      accent: zineAccentForRelease(RELEASE_ID),
    });
  });

  it('shares the release deep link from the modal', () => {
    dialog.playerOpen = true;
    renderLink();

    expect(screen.getByTestId('share-widget')).toHaveAttribute(
      'data-share-url',
      `https://fakefour.test${DEEP_LINK}`
    );
  });

  it('closes the player before "View all releases" navigates', async () => {
    dialog.playerOpen = true;
    const user = renderLink();

    await user.click(
      within(screen.getByRole('dialog')).getByRole('link', { name: 'View all releases' })
    );

    expect(dialog.handlePlayerOpenChange).toHaveBeenCalledWith(false);
    expect(push).toHaveBeenCalledWith('/releases?artist=marguerite-ash');
  });

  it('leaves a modified click on "View all releases" to the browser, keeping the player open', async () => {
    dialog.playerOpen = true;
    const user = renderLink();

    await user.keyboard('{Meta>}');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('link', { name: 'View all releases' })
    );
    await user.keyboard('{/Meta}');

    expect(dialog.handlePlayerOpenChange).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('returns focus to the title link when the player closes', async () => {
    dialog.playerOpen = true;
    const user = renderLink();

    await user.click(screen.getByRole('button', { name: 'close-focus' }));

    expect(screen.getByRole('link', { name: 'Night Shift' })).toHaveFocus();
  });
});
