/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { PublishedReleaseListing } from '@/lib/types/media-models';

import { ReleaseHeadlines } from './release-headlines';

const mockReleases = [
  {
    id: 'release-1',
    title: 'Midnight Serenade',
    coverArt: 'https://example.com/cover1.jpg',
    releasedOn: '2024-01-01T00:00:00.000Z',
    images: [],
    artistReleases: [
      {
        artist: {
          id: 'artist-1',
          firstName: 'John',
          surname: 'Doe',
          displayName: null,
          slug: 'john-doe',
        },
      },
    ],
    releaseUrls: [],
  },
  {
    id: 'release-2',
    title: 'Morning Glory',
    coverArt: 'https://example.com/cover2.jpg',
    releasedOn: '2024-02-01T00:00:00.000Z',
    images: [],
    artistReleases: [
      {
        artist: {
          id: 'artist-2',
          firstName: 'Jane',
          surname: 'Smith',
          displayName: 'J. Smith',
          slug: 'j-smith',
        },
      },
    ],
    releaseUrls: [],
  },
] as unknown as PublishedReleaseListing[];

const stubFetchReturning = (rows: PublishedReleaseListing[], nextSkip: number | null = null) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows, nextSkip }) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderHeadlines = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<ReleaseHeadlines />, { wrapper: Wrapper });
};

describe('ReleaseHeadlines', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders cutout release titles linking to the release page', async () => {
    stubFetchReturning(mockReleases);
    renderHeadlines();

    const title = await screen.findByRole('link', { name: 'Midnight Serenade' });
    expect(title).toHaveAttribute('href', '/releases/release-1');
    expect(title).toHaveClass('font-fake-four-cutout');
  });

  it('renders the artist subtitle linking to the artist page', async () => {
    stubFetchReturning(mockReleases);
    renderHeadlines();

    // displayName wins when present; otherwise full name.
    const subtitle = await screen.findByRole('link', { name: 'J. Smith' });
    expect(subtitle).toHaveAttribute('href', '/artists/j-smith');
    expect(await screen.findByRole('link', { name: 'John Doe' })).toHaveAttribute(
      'href',
      '/artists/john-doe'
    );
  });

  it('renders placeholder copy under each headline without entry borders', async () => {
    stubFetchReturning(mockReleases);
    const { container } = renderHeadlines();

    await screen.findByRole('link', { name: 'Midnight Serenade' });
    expect(screen.getAllByText(/lorem ipsum/i)).toHaveLength(2);
    container.querySelectorAll('li').forEach((entry) => {
      expect(entry.className).not.toMatch(/border/);
    });
  });

  it('shows only on desktop with a fade-and-chevron scroll cue', async () => {
    stubFetchReturning(mockReleases);
    const { container } = renderHeadlines();
    await screen.findByRole('link', { name: 'Midnight Serenade' });

    const aside = container.querySelector('[data-slot="release-headlines"]');
    expect(aside).toHaveClass('hidden', 'lg:block');
    // The list dissolves into the panel paper at its bottom edge and a
    // bouncing chevron signals there is more to scroll.
    const fade = container.querySelector('[data-slot="release-headlines-fade"]');
    expect(fade).toHaveClass('bg-gradient-to-t', 'pointer-events-none');
    expect(container.querySelector('.animate-bounce')).toBeInTheDocument();
  });

  it('loads the next page when scrolled near the bottom', async () => {
    const fetchMock = stubFetchReturning(mockReleases, 24);
    const { container } = renderHeadlines();
    await screen.findByRole('link', { name: 'Midnight Serenade' });

    const pane = container.querySelector<HTMLElement>('[data-slot="release-headlines-pane"]');
    if (!pane) {
      throw new Error('scroll pane not rendered');
    }
    // jsdom has no layout — fake being scrolled near the bottom.
    Object.defineProperties(pane, {
      scrollTop: { value: 500, configurable: true },
      clientHeight: { value: 400, configurable: true },
      scrollHeight: { value: 940, configurable: true },
    });
    fireEvent.scroll(pane);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('skip=24'), expect.anything());
    });
  });
});
