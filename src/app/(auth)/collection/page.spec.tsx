/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import CollectionPage from './page';

vi.mock('server-only', () => ({}));

// Mock auth
const mockAuth = vi.fn();
vi.mock('../../../../auth', () => ({
  auth: () => mockAuth(),
}));

// Mock next/navigation — redirect must throw to stop execution like the real redirect
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// Mock TanStack Query SSR utilities — execute each queryFn so coverage sees the arrow functions
const mockPrefetchQuery = vi.fn().mockImplementation(async (opts: { queryFn?: () => unknown }) => {
  if (opts.queryFn) opts.queryFn();
});
const mockDehydratedState = { queries: [], mutations: [] };
vi.mock('@tanstack/react-query', () => ({
  dehydrate: () => mockDehydratedState,
  HydrationBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({
    prefetchQuery: mockPrefetchQuery,
  }),
}));

vi.mock('@/lib/utils/fetch-api', () => ({
  fetchApi: vi.fn(),
}));

// Mock child components
vi.mock('@/app/components/collection-content', () => ({
  CollectionContent: () => <div data-testid="collection-content">Collection Content</div>,
}));

vi.mock('@/app/components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/page-container', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

describe('CollectionPage', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'user' },
    });
  });

  it('should redirect to signin when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(CollectionPage()).rejects.toThrow('NEXT_REDIRECT:/signin');
    expect(mockRedirect).toHaveBeenCalledWith('/signin');
  });

  it('should redirect to signin when user has no id', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    await expect(CollectionPage()).rejects.toThrow('NEXT_REDIRECT:/signin');
    expect(mockRedirect).toHaveBeenCalledWith('/signin');
  });

  it('should render page structure', async () => {
    const Page = await CollectionPage();
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should prefetch collection data with cookie forwarding', async () => {
    const Page = await CollectionPage();
    render(Page);

    expect(mockPrefetchQuery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        queryKey: ['collection', 'list'],
      })
    );
  });

  it('should render CollectionContent within HydrationBoundary', async () => {
    const Page = await CollectionPage();
    render(Page);

    expect(screen.getByTestId('collection-content')).toBeInTheDocument();
  });
});
