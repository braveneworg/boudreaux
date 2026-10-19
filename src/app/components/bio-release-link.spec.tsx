/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BioReleaseLink } from './bio-release-link';

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

// The listening modal is real; only its external edges are stood in for: the
// release detail fetch, the video.js player and the lazily-loaded social links.
const query = vi.hoisted(() => ({
  useReleaseQuery: vi.fn(),
}));
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
const HREF = `/releases?artist=e2e-artist&release=${RELEASE_ID}`;

const renderLink = () => {
  render(
    <BioReleaseLink href={HREF} artistSlug="e2e-artist" releaseId={RELEASE_ID}>
      E2E Album One
    </BioReleaseLink>
  );
  return userEvent.setup({ delay: null });
};

const link = (): HTMLElement => screen.getByRole('link', { name: 'E2E Album One', hidden: true });

/** Whether anything on the page asks the release query to fetch. */
const fetching = (): boolean =>
  query.useReleaseQuery.mock.calls.some(
    ([, options]) => (options as { enabled?: boolean } | undefined)?.enabled === true
  );

describe('BioReleaseLink', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'https://fakefour.test');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    hydrated.value = true;
    query.useReleaseQuery.mockReturnValue({ isPending: true, isError: false, data: undefined });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the stored deep link as the href', () => {
    renderLink();

    expect(link()).toHaveAttribute('href', HREF);
  });

  it('opens the listening modal unprimed on a plain left click: a bio link knows no stream', async () => {
    const user = renderLink();

    await user.click(link());

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('leaves a modified click to the browser', () => {
    renderLink();

    const notCanceled = fireEvent.click(link(), { ctrlKey: true });

    expect(notCanceled).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fetches the release only once hovered', async () => {
    const user = renderLink();
    expect(fetching()).toBe(false);

    await user.hover(link());

    expect(fetching()).toBe(true);
  });

  it('fetches the release once focused', () => {
    renderLink();

    act(() => link().focus());

    expect(fetching()).toBe(true);
  });

  it('fetches the release while the modal is open', () => {
    renderLink();

    fireEvent.click(link());

    expect(fetching()).toBe(true);
  });

  it('announces the dialog once hydrated', () => {
    renderLink();

    expect(link()).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('is a plain link before hydration, so the server markup matches', () => {
    hydrated.value = false;
    renderLink();

    expect(link()).not.toHaveAttribute('aria-haspopup');
  });

  it('titles the modal from the loaded release, described by its album artist', async () => {
    query.useReleaseQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        title: 'E2E Album One',
        albumArtist: { firstName: 'E2E', surname: 'Artist', displayName: 'E2E Artist' },
      },
    });
    const user = renderLink();

    await user.click(link());

    expect(screen.getByRole('dialog')).toHaveAccessibleName('E2E Album One');
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('E2E Artist');
  });

  it('shares the same deep link as an absolute URL', async () => {
    const user = renderLink();

    await user.click(link());

    expect(await screen.findByTestId('social-share-widget')).toHaveAttribute(
      'data-url',
      `https://fakefour.test${HREF}`
    );
  });
});
