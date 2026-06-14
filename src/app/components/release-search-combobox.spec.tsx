/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PublishedReleaseListing } from '@/lib/types/media-models';

import { ReleaseSearchCombobox } from './release-search-combobox';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/releases',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="search-thumbnail" data-src={src} data-alt={alt} />
  ),
}));

const mockReleases = [
  {
    id: 'release-1',
    title: 'Midnight Serenade',
    coverArt: 'https://example.com/cover1.jpg',
    images: [],
    artistReleases: [
      {
        id: 'ar-1',
        artistId: 'artist-1',
        releaseId: 'release-1',
        artist: { id: 'artist-1', firstName: 'John', surname: 'Doe', displayName: null },
      },
    ],
    releaseUrls: [],
  },
  {
    id: 'release-2',
    title: 'Morning Glory',
    coverArt: 'https://example.com/cover2.jpg',
    images: [],
    artistReleases: [
      {
        id: 'ar-2',
        artistId: 'artist-2',
        releaseId: 'release-2',
        artist: { id: 'artist-2', firstName: 'Jane', surname: 'Smith', displayName: 'J. Smith' },
      },
    ],
    releaseUrls: [],
  },
] as unknown as PublishedReleaseListing[];

const stubFetchReturning = (rows: PublishedReleaseListing[]) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows, nextSkip: null }) })
  );
};

const renderCombobox = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<ReleaseSearchCombobox />, { wrapper: Wrapper });
};

const setupUser = () => userEvent.setup();

describe('ReleaseSearchCombobox', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockPush.mockReset();
  });

  it('renders the search trigger button', () => {
    stubFetchReturning(mockReleases);
    renderCombobox();

    const button = screen.getByLabelText('Search releases');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('prompts the user to type before any search', async () => {
    stubFetchReturning(mockReleases);
    const user = setupUser();
    renderCombobox();

    await user.click(screen.getByLabelText('Search releases'));

    expect(screen.getByText(/type to search releases/i)).toBeInTheDocument();
  });

  it('fetches and displays server results when the user types', async () => {
    stubFetchReturning(mockReleases);
    const user = setupUser();
    renderCombobox();

    await user.click(screen.getByLabelText('Search releases'));
    await user.type(screen.getByPlaceholderText(/search by artist/i), 'Mid');

    await waitFor(() => {
      expect(screen.getByText('Midnight Serenade')).toBeInTheDocument();
    });
    // The request carries the typed search term.
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('search=Mid'),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('navigates to the release page when a result is selected', async () => {
    stubFetchReturning(mockReleases);
    const user = setupUser();
    renderCombobox();

    await user.click(screen.getByLabelText('Search releases'));
    await user.type(screen.getByPlaceholderText(/search by artist/i), 'Mid');

    await waitFor(() => {
      expect(screen.getByText('Midnight Serenade')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Midnight Serenade'));

    expect(mockPush).toHaveBeenCalledWith('/releases/release-1');
  });

  it('renders a cover art thumbnail when present', async () => {
    stubFetchReturning(mockReleases);
    const user = setupUser();
    renderCombobox();

    await user.click(screen.getByLabelText('Search releases'));
    await user.type(screen.getByPlaceholderText(/search by artist/i), 'a');

    await waitFor(() => {
      expect(screen.getAllByTestId('search-thumbnail').length).toBeGreaterThan(0);
    });
  });

  it('renders a placeholder icon when no cover art is available', async () => {
    stubFetchReturning([
      {
        id: 'release-nc',
        title: 'No Cover Album',
        coverArt: null,
        images: [],
        artistReleases: [
          {
            id: 'ar-nc',
            artistId: 'artist-1',
            releaseId: 'release-nc',
            artist: { id: 'artist-1', firstName: 'John', surname: 'Doe', displayName: null },
          },
        ],
        releaseUrls: [],
      },
    ] as unknown as PublishedReleaseListing[]);
    const user = setupUser();
    renderCombobox();

    await user.click(screen.getByLabelText('Search releases'));
    await user.type(screen.getByPlaceholderText(/search by artist/i), 'No');

    await waitFor(() => {
      expect(screen.getByText('No Cover Album')).toBeInTheDocument();
    });
    expect(screen.getByText('♫')).toBeInTheDocument();
    expect(screen.queryByTestId('search-thumbnail')).not.toBeInTheDocument();
  });

  it('omits the artist name when a release has no artists', async () => {
    stubFetchReturning([
      {
        id: 'release-na',
        title: 'Mystery Album',
        coverArt: 'https://example.com/cover.jpg',
        images: [],
        artistReleases: [],
        releaseUrls: [],
      },
    ] as unknown as PublishedReleaseListing[]);
    const user = setupUser();
    renderCombobox();

    await user.click(screen.getByLabelText('Search releases'));
    await user.type(screen.getByPlaceholderText(/search by artist/i), 'Mys');

    await waitFor(() => {
      expect(screen.getByText('Mystery Album')).toBeInTheDocument();
    });
    expect(screen.queryByText('Unknown Artist')).not.toBeInTheDocument();
  });

  it('displays the artist displayName when present', async () => {
    stubFetchReturning(mockReleases);
    const user = setupUser();
    renderCombobox();

    await user.click(screen.getByLabelText('Search releases'));
    await user.type(screen.getByPlaceholderText(/search by artist/i), 'Glory');

    await waitFor(() => {
      expect(screen.getByText('J. Smith')).toBeInTheDocument();
    });
  });

  it('shows "No releases found" when the server returns no matches', async () => {
    stubFetchReturning([]);
    const user = setupUser();
    renderCombobox();

    await user.click(screen.getByLabelText('Search releases'));
    await user.type(screen.getByPlaceholderText(/search by artist/i), 'zzz');

    await waitFor(() => {
      expect(screen.getByText(/no releases found/i)).toBeInTheDocument();
    });
  });
});
