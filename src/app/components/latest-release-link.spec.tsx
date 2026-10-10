/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LatestReleaseLink, type LatestRelease } from './latest-release-link';

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

vi.mock('./release-play-dialog', () => ({
  ReleasePlayDialog: ({
    open,
    footer,
    onCloseAutoFocus,
  }: {
    open: boolean;
    footer?: React.ReactNode;
    onCloseAutoFocus?: (event: Event) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="player">
        {footer}
        <button type="button" onClick={() => onCloseAutoFocus?.(new Event('focus'))}>
          close-focus
        </button>
      </div>
    ) : null,
}));

const playable: LatestRelease = {
  id: 'rel-1',
  title: 'Night Shift',
  releasedOn: new Date('2024-09-30T23:30:00.000Z'),
  playSrc: 'https://cdn.example/track-1.mp3',
  byName: null,
};

const renderLink = (release: Partial<LatestRelease> = {}) => {
  render(
    <LatestReleaseLink
      release={{ ...playable, ...release }}
      artistName="Marguerite Ash"
      slug="marguerite-ash"
    />
  );
  return userEvent.setup({ delay: null });
};

describe('LatestReleaseLink', () => {
  beforeEach(() => {
    hydrated.value = true;
    dialog.playerOpen = false;
  });

  it('links the title to the release page with the UTC year', () => {
    renderLink();

    const link = screen.getByRole('link', { name: 'Night Shift' });
    expect(link).toHaveAttribute('href', '/releases/rel-1');
    expect(link).toHaveAttribute('data-prefetch', 'false');
    expect(link.parentElement).toHaveTextContent('Latest Release: Night Shift (2024)');
  });

  it('labels the line, keeping the label out of the link', () => {
    renderLink();

    const label = screen.getByText('Latest Release:');
    expect(label.closest('a')).toBeNull();
    expect(label.parentElement).toContainElement(screen.getByRole('link', { name: 'Night Shift' }));
  });

  it('names the album artist when this artist is only featured', () => {
    renderLink({ byName: 'Ceschi' });

    expect(screen.getByRole('link', { name: 'Night Shift' }).parentElement).toHaveTextContent(
      'Latest Release: Night Shift by Ceschi (2024)'
    );
  });

  it('offers every release beneath the line, with an eye icon ahead of the words', () => {
    renderLink();

    const link = screen.getByRole('link', { name: 'View all releases' });
    expect(link).toHaveAttribute('href', '/artists/marguerite-ash/releases');
    const icon = link.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon?.nextSibling).toHaveTextContent('View all releases');
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

  it('is a plain link when nothing is playable', async () => {
    const user = renderLink({ playSrc: null });
    const link = screen.getByRole('link', { name: 'Night Shift' });
    expect(link).not.toHaveAttribute('aria-haspopup');

    await user.click(link);

    expect(dialog.openPlayer).not.toHaveBeenCalled();
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

  it('closes the player before "View all releases" navigates', async () => {
    dialog.playerOpen = true;
    const user = renderLink();

    await user.click(
      within(screen.getByRole('dialog')).getByRole('link', { name: 'View all releases' })
    );

    expect(dialog.handlePlayerOpenChange).toHaveBeenCalledWith(false);
    expect(push).toHaveBeenCalledWith('/artists/marguerite-ash/releases');
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
