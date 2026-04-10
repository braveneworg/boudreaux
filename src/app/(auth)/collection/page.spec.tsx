/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import CollectionPage from './page';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      toString: () => 'session-token=abc123',
    })
  ),
}));

// Mock next/navigation
const mockRedirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock getInternalApiUrl
vi.mock('@/lib/utils/get-internal-api-url', () => ({
  getInternalApiUrl: vi.fn((path: string) => Promise.resolve(`http://test-host${path}`)),
}));

// Mock UI components
vi.mock('@/app/components/collection-list', () => ({
  CollectionList: ({
    purchases,
    isAdmin,
  }: {
    purchases: Array<{ id: string }>;
    isAdmin: boolean;
  }) => (
    <div data-testid="collection-list" data-count={purchases.length} data-admin={String(isAdmin)}>
      Collection
    </div>
  ),
}));

vi.mock('@/app/components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: () => <nav data-testid="breadcrumb-menu">Breadcrumbs</nav>,
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
  const mockPurchases = [
    { id: 'purchase-1', releaseId: 'release-1', release: { title: 'Album A' } },
    { id: 'purchase-2', releaseId: 'release-2', release: { title: 'Album B' } },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ purchases: mockPurchases, isAdmin: false }),
    }) as unknown as typeof fetch;
  });

  it('should fetch collection via internal API with cookies', async () => {
    const Page = await CollectionPage();
    render(Page);

    expect(global.fetch).toHaveBeenCalledWith('http://test-host/api/user/collection', {
      cache: 'no-store',
      headers: { Cookie: 'session-token=abc123' },
    });
  });

  it('should render page structure', async () => {
    const Page = await CollectionPage();
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-menu')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My Collection' })).toBeInTheDocument();
  });

  it('should render CollectionList with purchases', async () => {
    const Page = await CollectionPage();
    render(Page);

    const list = screen.getByTestId('collection-list');
    expect(list).toHaveAttribute('data-count', '2');
    expect(list).toHaveAttribute('data-admin', 'false');
  });

  it('should pass isAdmin=true for admin users', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ purchases: mockPurchases, isAdmin: true }),
    }) as unknown as typeof fetch;

    const Page = await CollectionPage();
    render(Page);

    expect(screen.getByTestId('collection-list')).toHaveAttribute('data-admin', 'true');
  });

  it('should redirect to signin on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    }) as unknown as typeof fetch;

    await CollectionPage();

    expect(mockRedirect).toHaveBeenCalledWith('/signin');
  });

  it('should render empty state when no purchases', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ purchases: [], isAdmin: false }),
    }) as unknown as typeof fetch;

    const Page = await CollectionPage();
    render(Page);

    expect(screen.getByText('No purchases yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'releases' })).toHaveAttribute('href', '/releases');
    expect(screen.queryByTestId('collection-list')).not.toBeInTheDocument();
  });

  it('should handle failed fetch gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    }) as unknown as typeof fetch;

    const Page = await CollectionPage();
    render(Page);

    // Falls back to empty state
    expect(screen.getByText('No purchases yet.')).toBeInTheDocument();
  });
});
