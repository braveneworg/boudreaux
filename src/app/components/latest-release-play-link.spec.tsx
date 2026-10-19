/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LatestReleasePlayLink, type LatestRelease } from './latest-release-play-link';

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

// The listening modal is real; only its external edges are stood in for: the
// release detail fetch, the video.js player and the lazily-loaded social links.
const query = vi.hoisted(() => ({ useReleaseQuery: vi.fn() }));
vi.mock('@/hooks/queries/use-release-query', () => ({
  useReleaseQuery: (...args: unknown[]): unknown => query.useReleaseQuery(...args),
}));

vi.mock('./release-player', () => ({
  ReleasePlayer: () => <div data-testid="release-player" />,
}));

vi.mock('./social-share-widget', () => ({
  SocialShareWidget: ({ url }: { url: string }) => (
    <div data-testid="social-share-widget" data-url={url} />
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

const titleLink = (): HTMLElement =>
  screen.getByRole('link', { name: 'Night Shift', hidden: true });

/** Open the modal with a plain left click on the title. */
const openModal = async (release: Partial<LatestRelease> = {}) => {
  const user = renderLink(release);
  await user.click(titleLink());
  return user;
};

/** The `enabled` the listening modal last asked the release query for. */
const lastQueryEnabled = (): unknown => query.useReleaseQuery.mock.calls.at(-1)?.[1]?.enabled;

describe('LatestReleasePlayLink', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'https://fakefour.test');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    query.useReleaseQuery.mockReturnValue({ isPending: true, isError: false, data: undefined });
    hydrated.value = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      expect(query.useReleaseQuery).not.toHaveBeenCalled();
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

  describe('before hydration', () => {
    beforeEach(() => {
      hydrated.value = false;
    });

    it('renders the title as a link-styled button with no href, so a click before the JS runs stays put', () => {
      renderLink();

      const title = screen.getByRole('button', { name: 'Night Shift' });
      expect(title).toHaveAttribute('type', 'button');
      expect(title).not.toHaveAttribute('href');
      expect(title).not.toHaveAttribute('aria-haspopup');
      expect(screen.queryByRole('link', { name: 'Night Shift' })).not.toBeInTheDocument();
    });

    // A button box is atomic: it cannot wrap inside the line like the link,
    // so the hydration swap would reflow a long title. The button draws no
    // box, and its text is an inline span styled like the link.
    it('draws no box of its own, its text styled like the link with a pointer', () => {
      renderLink();

      const title = screen.getByRole('button', { name: 'Night Shift' });
      expect(title).toHaveClass('contents');
      expect(within(title).getByText('Night Shift')).toHaveClass(
        'underline',
        'underline-offset-4',
        'cursor-pointer'
      );
    });

    it('keeps the card styling on the card variant', () => {
      renderLink({}, 'card');

      const title = screen.getByRole('button', { name: 'Night Shift' });
      expect(title).not.toHaveAttribute('href');
      expect(within(title).getByText('Night Shift')).toHaveClass(
        'underline',
        'underline-offset-2',
        'cursor-pointer'
      );
    });

    it('opens the modal on a plain left click', async () => {
      const user = renderLink();

      await user.click(screen.getByRole('button', { name: 'Night Shift' }));

      expect(screen.getByRole('dialog', { name: 'Night Shift' })).toBeInTheDocument();
    });

    it('shows the title as plain text when nothing is playable', () => {
      renderLink({ playSrc: null });

      expect(screen.queryByRole('button', { name: 'Night Shift' })).not.toBeInTheDocument();
      expect(screen.getByText('Night Shift').tagName).toBe('SPAN');
    });
  });

  it("opens the modal in place on a plain left click, playing the release's track", async () => {
    await openModal();

    expect(screen.getByRole('dialog', { name: 'Night Shift' })).toBeInTheDocument();
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.instances[0]).toHaveAttribute(
      'src',
      'https://cdn.example/track-1.mp3'
    );
  });

  it('leaves a modified click to the browser', () => {
    renderLink();

    const notCanceled = fireEvent.click(titleLink(), { metaKey: true });

    expect(notCanceled).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('warms the modal when the link is hovered', async () => {
    const user = renderLink();
    expect(lastQueryEnabled()).toBe(false);

    await user.hover(titleLink());

    expect(lastQueryEnabled()).toBe(true);
  });

  it('warms the modal when the link is focused', () => {
    renderLink();

    act(() => titleLink().focus());

    expect(lastQueryEnabled()).toBe(true);
  });

  it('titles the modal with the release, described by the album artist when featured', async () => {
    await openModal({ byName: 'Ceschi', albumArtistSlug: 'ceschi' });

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Night Shift');
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Ceschi');
  });

  it("shares the album artist's release deep link from the modal", async () => {
    await openModal({ byName: 'Ceschi', albumArtistSlug: 'ceschi' });

    expect(await screen.findByTestId('social-share-widget')).toHaveAttribute(
      'data-url',
      `https://fakefour.test/releases?artist=ceschi&release=${RELEASE_ID}`
    );
  });

  it('closes the modal before "View all releases" navigates', async () => {
    const user = await openModal();

    await user.click(
      within(screen.getByRole('dialog')).getByRole('link', { name: 'View all releases' })
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(push.mock.calls).toEqual([['/releases?artist=marguerite-ash']]);
  });

  it('leaves a modified click on "View all releases" to the browser, keeping the modal open', async () => {
    await openModal();

    const notCanceled = fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('link', { name: 'View all releases' }),
      { metaKey: true }
    );

    expect(notCanceled).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('returns focus to the title link when the modal closes', async () => {
    const user = await openModal();

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(titleLink()).toHaveFocus());
  });
});
