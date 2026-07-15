/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import type { PlaylistDetailResponse } from '@/lib/types/domain/playlist';

import PlaylistDetailPage from './page';

vi.mock('server-only', () => ({}));

// Mock auth — the server-side session gate.
const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

// next/navigation — BOTH sentinels must throw to halt execution like the real ones.
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
  notFound: () => mockNotFound(),
}));

// Mock TanStack Query SSR utilities — passthrough hydration boundary.
const mockDehydratedState = { queries: [], mutations: [] };
vi.mock('@tanstack/react-query', () => ({
  dehydrate: () => mockDehydratedState,
  HydrationBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockSetQueryData = vi.fn();
vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({ setQueryData: mockSetQueryData }),
}));

const mockGetOwnedOrPublicDetail = vi.fn();
vi.mock('@/lib/services/playlist-service', () => ({
  PlaylistService: {
    getOwnedOrPublicDetail: (...args: unknown[]) => mockGetOwnedOrPublicDetail(...args),
  },
}));

// Mock the shell containers + the client content island.
vi.mock('@/app/components/ui/page-container', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: ({
    items,
  }: {
    items: Array<{ anchorText: string; url: string; isActive: boolean }>;
  }) => (
    <nav data-testid="breadcrumb-menu" data-items={JSON.stringify(items)}>
      Breadcrumbs
    </nav>
  ),
}));

vi.mock('@/app/components/playlists/playlist-detail-content', () => ({
  PlaylistDetailContent: ({ playlistId }: { playlistId: string }) => (
    <div data-testid="playlist-detail-content" data-playlist-id={playlistId} />
  ),
}));

const VALID_ID = '507f1f77bcf86cd799439011';
const DETAIL: PlaylistDetailResponse = {
  id: VALID_ID,
  title: 'Road Mix',
  isPublic: true,
  isOwner: false,
  coverImages: [],
  itemCount: 1,
  totalDuration: 200,
  items: [],
};
const makeProps = (id: string) => ({ params: Promise.resolve({ id }) });

describe('PlaylistDetailPage', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    mockGetOwnedOrPublicDetail.mockResolvedValue(DETAIL);
  });

  it('redirects to signin when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(PlaylistDetailPage(makeProps(VALID_ID))).rejects.toThrow('NEXT_REDIRECT:/signin');
    expect(mockRedirect).toHaveBeenCalledWith('/signin');
  });

  it('redirects to signin when the user has no id', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    await expect(PlaylistDetailPage(makeProps(VALID_ID))).rejects.toThrow('NEXT_REDIRECT:/signin');
    expect(mockGetOwnedOrPublicDetail).not.toHaveBeenCalled();
  });

  it('404s a malformed id before touching the service', async () => {
    await expect(PlaylistDetailPage(makeProps('not-an-objectid'))).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(mockGetOwnedOrPublicDetail).not.toHaveBeenCalled();
  });

  it('404s when the service resolves null (missing or private-unowned)', async () => {
    mockGetOwnedOrPublicDetail.mockResolvedValue(null);

    await expect(PlaylistDetailPage(makeProps(VALID_ID))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockSetQueryData).not.toHaveBeenCalled();
  });

  it('reads the detail as the signed-in user', async () => {
    await PlaylistDetailPage(makeProps(VALID_ID));

    expect(mockGetOwnedOrPublicDetail).toHaveBeenCalledExactlyOnceWith(VALID_ID, 'user-1');
  });

  it('renders the heading and breadcrumbs and seeds the detail cache', async () => {
    const Page = await PlaylistDetailPage(makeProps(VALID_ID));
    render(Page);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Road Mix');
    const nav = screen.getByTestId('breadcrumb-menu');
    expect(JSON.parse(nav.getAttribute('data-items') ?? '[]')).toContainEqual({
      anchorText: 'My Playlists',
      url: '/playlists',
      isActive: false,
    });
    expect(mockSetQueryData).toHaveBeenCalledExactlyOnceWith(
      ['playlists', 'detail', VALID_ID],
      DETAIL
    );
  });

  it('hydrates the content island with the playlist id', async () => {
    const Page = await PlaylistDetailPage(makeProps(VALID_ID));
    render(Page);

    expect(screen.getByTestId('playlist-detail-content')).toHaveAttribute(
      'data-playlist-id',
      VALID_ID
    );
  });

  it('renders the content on a kraft zine panel', async () => {
    const Page = await PlaylistDetailPage(makeProps(VALID_ID));
    const { container } = render(Page);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toHaveClass('zine-accent-kraft');
  });
});
