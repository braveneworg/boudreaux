/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { fetchApi } from '@/lib/utils/fetch-api';

import ArtistSearchPage from './page';

vi.mock('server-only', () => ({}));

// Combobox shape ({ results }) the results panel reads via
// `useArtistNavSearchQuery`.
const comboboxResponse = {
  results: [
    {
      artistSlug: 'test-artist',
      artistName: 'Test Artist',
      thumbnailSrc: null,
      releases: [{ id: 'r1', title: 'Test Release' }],
    },
  ],
};

// Simulate the `/api/artists/search` route accurately by URL: the page-only
// `{ artists }` envelope when `format=full` is requested, and the combobox
// `{ results }` shape otherwise. A prefetch that dehydrates the wrong shape
// under the shared query key then surfaces as the empty state below.
vi.mock('@/lib/utils/fetch-api', () => ({
  fetchApi: vi.fn(async (path: string) => {
    if (path.includes('format=full')) {
      return { artists: [{ slug: 'test-artist', name: 'Test Artist' }] };
    }
    return comboboxResponse;
  }),
}));

// The results panel's navigation callbacks use the router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span data-alt={alt} />,
}));

// Keep the results panel, its search hook, and react-query hydration REAL.
// Only replace the jsdom-fragile cmdk primitives and the surrounding page
// chrome so this test isolates the prefetch -> hydrate -> panel seam.
vi.mock('@/app/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children, heading }: { children: React.ReactNode; heading?: string }) => (
    <div data-heading={heading}>{children}</div>
  ),
  CommandItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/app/components/artist-search-input', () => ({
  ArtistSearchInput: () => <div data-testid="artist-search-input" />,
}));

vi.mock('@/app/components/ui/page-container', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/app/components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/app/components/ui/zine-panel', () => ({
  ZinePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/app/components/ui/zine-heading', () => ({
  ZineHeading: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const renderPage = async (query: string) => {
  // 30s staleTime mirrors the production client so hydrated data stays fresh
  // and the panel reads the dehydrated cache instead of refetching.
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false } },
  });
  const Page = await ArtistSearchPage({ searchParams: Promise.resolve({ q: query }) });
  return render(<QueryClientProvider client={client}>{Page}</QueryClientProvider>);
};

describe('ArtistSearchPage hydration', () => {
  it('renders results (not the empty state) when landing on /artists/search?q=', async () => {
    await renderPage('john');

    expect(await screen.findByText('All releases by Test Artist')).toBeInTheDocument();
    expect(screen.queryByText('No artists or releases found.')).not.toBeInTheDocument();
  });

  it('prefetches the combobox URL the panel hook reads, without format=full', async () => {
    await renderPage('john');

    expect(vi.mocked(fetchApi)).toHaveBeenCalledWith('/api/artists/search?q=john');
  });
});
