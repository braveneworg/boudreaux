/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    releasedOn: '2024-01-01T00:00:00.000Z',
    description: null,
    formats: [],
    catalogNumber: null,
    images: [],
    artistReleases: [
      {
        id: 'ar-1',
        artistId: 'artist-1',
        releaseId: 'release-1',
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
    digitalFormats: [],
  },
  {
    id: 'release-2',
    title: 'Morning Glory',
    coverArt: 'https://example.com/cover2.jpg',
    releasedOn: '2024-02-01T00:00:00.000Z',
    description: null,
    formats: [],
    catalogNumber: null,
    images: [],
    artistReleases: [
      {
        id: 'ar-2',
        artistId: 'artist-2',
        releaseId: 'release-2',
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
    digitalFormats: [],
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

  it('auto-populates the dropdown with browsable releases on open', async () => {
    stubFetchReturning(mockReleases);
    const user = setupUser();
    renderCombobox();

    await user.click(screen.getByLabelText('Search releases'));

    // No typing needed — the published listing streams straight in.
    expect(await screen.findByText('Midnight Serenade')).toBeInTheDocument();
    expect(screen.getByText('Morning Glory')).toBeInTheDocument();
    expect(screen.queryByText(/type to search releases/i)).not.toBeInTheDocument();
  });

  it('loads the next page when the browse list scrolls near the bottom', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: mockReleases, nextSkip: 24 }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = setupUser();
    renderCombobox();

    await user.click(screen.getByLabelText('Search releases'));
    await screen.findByText('Midnight Serenade');

    const list = document.querySelector<HTMLElement>('[data-slot="command-list"]');
    if (!list) {
      throw new Error('command list not rendered');
    }
    // jsdom has no layout — fake being scrolled to within the near-bottom
    // threshold, then fire the scroll the handler listens for.
    Object.defineProperties(list, {
      scrollTop: { value: 380, configurable: true },
      clientHeight: { value: 300, configurable: true },
      scrollHeight: { value: 400, configurable: true },
    });
    fireEvent.scroll(list);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('skip=24'), expect.anything());
    });
  });

  it('lists results under a plain query row with its divider, like the artists search', async () => {
    stubFetchReturning(mockReleases);
    const user = setupUser();
    renderCombobox();

    await user.click(screen.getByLabelText('Search releases'));

    // Radix portals the dropdown to the body — query the document.
    const wrapper = document.querySelector('[data-slot="command-input-wrapper"]');
    expect(wrapper).not.toHaveClass('bg-[#d0fffe]');
    const command = document.querySelector('[data-slot="command"]');
    expect(command?.className).not.toContain('border-b-0');
  });

  it('wears the same punk-zine box as the artists search', () => {
    stubFetchReturning(mockReleases);
    renderCombobox();

    const trigger = screen.getByLabelText('Search releases');
    expect(trigger).toHaveClass('border-2', 'border-black', 'shadow-zine-ink', 'text-zinc-950');
  });

  it('draws a bold search icon on the trigger', () => {
    stubFetchReturning(mockReleases);
    renderCombobox();

    const icon = screen.getByLabelText('Search releases').querySelector('svg');
    expect(icon).toHaveAttribute('stroke-width', '2.5');
  });

  it('rings the trigger in the accent of the panel it sits in', () => {
    stubFetchReturning(mockReleases);
    renderCombobox();

    const trigger = screen.getByLabelText('Search releases');
    expect(trigger).toHaveClass(
      'focus-visible:ring-(--card-accent)',
      'data-[state=open]:ring-(--card-accent)'
    );
    expect(trigger).not.toHaveClass('focus-visible:ring-[#45fefc]');
  });

  it('fetches and displays server results when the user types', async () => {
    stubFetchReturning(mockReleases);
    const user = setupUser();
    renderCombobox();

    await user.click(screen.getByLabelText('Search releases'));
    await user.type(screen.getByPlaceholderText(/search by artist/i), 'Mid');

    // Browse results render immediately, so wait for the debounced search
    // request itself — it carries the typed term.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=Mid'),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
    expect(await screen.findByText('Midnight Serenade')).toBeInTheDocument();
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
        coverArt: '',
        releasedOn: '2024-03-01T00:00:00.000Z',
        description: null,
        formats: [],
        catalogNumber: null,
        images: [],
        artistReleases: [
          {
            id: 'ar-nc',
            artistId: 'artist-1',
            releaseId: 'release-nc',
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
        digitalFormats: [],
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
        releasedOn: '2024-04-01T00:00:00.000Z',
        description: null,
        formats: [],
        catalogNumber: null,
        images: [],
        artistReleases: [],
        releaseUrls: [],
        digitalFormats: [],
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
