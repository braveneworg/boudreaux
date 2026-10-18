/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { zineAccentForRelease } from '@/app/components/ui/zine-panel';

import { DeepLinkPlayDialog, type DeepLinkRelease } from './deep-link-play-dialog';

import type { ReleasePlayDialogProps } from './release-play-dialog';

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

const dialogProps = vi.hoisted(() => ({ current: null as ReleasePlayDialogProps | null }));
vi.mock('./release-play-dialog', () => ({
  ReleasePlayDialog: (props: ReleasePlayDialogProps) => {
    dialogProps.current = props;
    return props.open ? (
      <div role="dialog" aria-label={props.title}>
        {props.shareWidget}
        {props.footer}
        <button type="button" onClick={() => props.onOpenChange(false)}>
          close
        </button>
      </div>
    ) : null;
  },
}));

vi.mock('./release-share-widget', () => ({
  ReleaseShareWidget: ({ shareUrl }: { shareUrl?: string }) => (
    <div data-testid="share-widget" data-share-url={shareUrl} />
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

const props = (): ReleasePlayDialogProps => {
  if (!dialogProps.current) throw new Error('ReleasePlayDialog was not rendered');
  return dialogProps.current;
};

describe('DeepLinkPlayDialog', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'https://fakefour.test');
    dialogProps.current = null;
  });

  it('opens the release on arrival', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'E2E Album One' })).toBeInTheDocument();
    expect(props()).toMatchObject({
      releaseId: RELEASE.id,
      title: 'E2E Album One',
      artistName: 'E2E Artist',
      year: 2024,
      open: true,
    });
  });

  it('opens unprimed and paused: there was no gesture to play from', () => {
    renderDialog();

    expect(props().takeMediaEl()).toBeNull();
    expect(props().autoPlay).toBe(false);
  });

  it("frames the modal in the release's own accent, artist first, centered, a sheet on phones", () => {
    renderDialog();

    expect(props()).toMatchObject({
      accent: zineAccentForRelease(RELEASE.id),
      headingOrder: 'artist-first',
      centered: true,
      sheetOnPhone: true,
    });
  });

  it('shares the release deep link', () => {
    renderDialog();

    expect(screen.getByTestId('share-widget')).toHaveAttribute(
      'data-share-url',
      `https://fakefour.test/releases?artist=e2e-artist&release=${RELEASE.id}`
    );
  });

  it("drops the release from the URL on close, so back or refresh doesn't reopen it", async () => {
    const user = renderDialog();

    await user.click(screen.getByRole('button', { name: 'close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(replace.mock.calls).toEqual([['/releases?artist=e2e-artist', { scroll: false }]]);
  });

  it("links to the artist's releases under the player", () => {
    renderDialog();

    expect(screen.getByRole('link', { name: 'View all releases' })).toHaveAttribute(
      'href',
      '/releases?artist=e2e-artist'
    );
  });

  it('closes onto the listing from "View all releases" on a plain click', async () => {
    const user = renderDialog();

    await user.click(screen.getByRole('link', { name: 'View all releases' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(replace.mock.calls).toEqual([['/releases?artist=e2e-artist', { scroll: false }]]);
  });

  it('leaves a modified click on "View all releases" to the browser', () => {
    renderDialog();

    const link = screen.getByRole('link', { name: 'View all releases' });
    const notCanceled = fireEvent.click(link, { metaKey: true });

    expect(notCanceled).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
