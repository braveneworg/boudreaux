/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { zineAccentForRelease } from '@/app/components/ui/zine-panel';

import { BioReleaseLink } from './bio-release-link';

import type { ReleasePlayDialogProps } from './release-play-dialog';

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

const hydrated = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => hydrated.value }));

const query = vi.hoisted(() => ({
  useReleaseQuery: vi.fn(),
}));
vi.mock('@/hooks/queries/use-release-query', () => ({
  useReleaseQuery: (...args: unknown[]) => query.useReleaseQuery(...args),
}));

const dialog = vi.hoisted(() => ({
  playerOpen: false,
  openPlayer: vi.fn(),
  handlePlayerOpenChange: vi.fn(),
  warmPlayer: vi.fn(),
  takeMediaEl: vi.fn(() => null),
  useReleasePlayDialog: vi.fn(),
}));
vi.mock('@/hooks/use-release-play-dialog', () => ({
  useReleasePlayDialog: (playSrc: string | null) => {
    dialog.useReleasePlayDialog(playSrc);
    return { ...dialog, prefetchPlayer: false };
  },
}));

const dialogProps = vi.hoisted(() => ({ current: null as ReleasePlayDialogProps | null }));
vi.mock('./release-play-dialog', () => ({
  ReleasePlayDialog: (props: ReleasePlayDialogProps) => {
    dialogProps.current = props;
    return props.open ? <div role="dialog">{props.shareWidget}</div> : null;
  },
}));

vi.mock('./release-share-widget', () => ({
  ReleaseShareWidget: ({ shareUrl }: { shareUrl?: string }) => (
    <div data-testid="share-widget" data-share-url={shareUrl} />
  ),
}));

const RELEASE_ID = '0123456789abcdef01234567';
const HREF = `/releases?artist=e2e-artist&release=${RELEASE_ID}`;

const renderLink = () => {
  render(
    <BioReleaseLink href={HREF} artistSlug="e2e-artist" releaseId={RELEASE_ID}>
      E2E Album One
    </BioReleaseLink>
  );
  return userEvent.setup({ delay: null });
};

/** The `enabled` the link last asked the release query for. */
const lastQueryEnabled = (): unknown => query.useReleaseQuery.mock.calls.at(-1)?.[1]?.enabled;

describe('BioReleaseLink', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'https://fakefour.test');
    hydrated.value = true;
    dialog.playerOpen = false;
    dialogProps.current = null;
    query.useReleaseQuery.mockReturnValue({ data: undefined });
  });

  it('renders the stored deep link as the href', () => {
    renderLink();

    expect(screen.getByRole('link', { name: 'E2E Album One' })).toHaveAttribute('href', HREF);
  });

  it('owns an unprimed play dialog: a bio link knows no stream before the release loads', () => {
    renderLink();

    expect(dialog.useReleasePlayDialog).toHaveBeenCalledWith(null);
  });

  it('opens the listening modal unprimed on a plain left click', async () => {
    const user = renderLink();

    await user.click(screen.getByRole('link', { name: 'E2E Album One' }));

    expect(dialog.handlePlayerOpenChange.mock.calls).toEqual([[true]]);
    expect(dialog.openPlayer).not.toHaveBeenCalled();
  });

  it('leaves a modified click to the browser', () => {
    renderLink();

    const notCanceled = fireEvent.click(screen.getByRole('link', { name: 'E2E Album One' }), {
      ctrlKey: true,
    });

    expect(notCanceled).toBe(true);
    expect(dialog.handlePlayerOpenChange).not.toHaveBeenCalled();
  });

  it('fetches the release only once hovered, focused or open', async () => {
    const user = renderLink();
    expect(lastQueryEnabled()).toBe(false);

    await user.hover(screen.getByRole('link', { name: 'E2E Album One' }));

    expect(query.useReleaseQuery).toHaveBeenLastCalledWith(RELEASE_ID, { enabled: true });
  });

  it('fetches the release while the modal is open', () => {
    dialog.playerOpen = true;
    renderLink();

    expect(lastQueryEnabled()).toBe(true);
  });

  it('announces the dialog once hydrated', () => {
    renderLink();

    expect(screen.getByRole('link', { name: 'E2E Album One' })).toHaveAttribute(
      'aria-haspopup',
      'dialog'
    );
  });

  it('is a plain link before hydration, so the server markup matches', () => {
    hydrated.value = false;
    renderLink();

    expect(screen.getByRole('link', { name: 'E2E Album One' })).not.toHaveAttribute(
      'aria-haspopup'
    );
  });

  it("titles the modal from the loaded release, in the release's own accent", () => {
    query.useReleaseQuery.mockReturnValue({
      data: {
        title: 'E2E Album One',
        albumArtist: { firstName: 'E2E', surname: 'Artist', displayName: 'E2E Artist' },
      },
    });
    renderLink();

    expect(dialogProps.current).toMatchObject({
      releaseId: RELEASE_ID,
      title: 'E2E Album One',
      artistName: 'E2E Artist',
      accent: zineAccentForRelease(RELEASE_ID),
      takeMediaEl: dialog.takeMediaEl,
    });
  });

  it('shares the same deep link as an absolute URL', () => {
    dialog.playerOpen = true;
    renderLink();

    expect(screen.getByTestId('share-widget')).toHaveAttribute(
      'data-share-url',
      `https://fakefour.test${HREF}`
    );
  });
});
