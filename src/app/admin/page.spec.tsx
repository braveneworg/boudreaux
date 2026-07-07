/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import type { AdminStats } from '@/lib/services/admin-stats-service';

import AdminDashboardPage from './page';

vi.mock('server-only', () => ({}));

const mockGetStats = vi.fn();
vi.mock('@/lib/services/admin-stats-service', () => ({
  AdminStatsService: { getStats: () => mockGetStats() },
}));

vi.mock('@/app/components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: ({ items }: { items: { anchorText: string; url: string }[] }) => (
    <nav data-testid="breadcrumb">
      {items.map((item) => (
        <a key={item.url} href={item.url}>
          {item.anchorText}
        </a>
      ))}
    </nav>
  ),
}));

vi.mock('./components/dashboard-charts', () => ({
  DashboardCharts: () => <div data-testid="dashboard-charts">charts</div>,
}));

const stats: AdminStats = {
  releases: { total: 10, published: 7, draft: 3 },
  featuredArtists: { total: 3 },
  artists: { total: 20, published: 12 },
  notifications: { activeSlots: 2 },
  chat: { flaggedUsers: 4, disabledUsers: 1 },
  tours: { total: 5, upcomingDates: 8 },
  videos: { total: 6, published: 4, draft: 2 },
};

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    mockGetStats.mockResolvedValue(stats);
  });

  it('renders the dashboard heading', async () => {
    render(await AdminDashboardPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders a tile link for every admin section', async () => {
    render(await AdminDashboardPage());

    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'href',
      '/admin/releases'
    );
    expect(screen.getByRole('link', { name: 'Tours' })).toHaveAttribute('href', '/admin/tours');
  });

  it('shows the release totals and breakdown', async () => {
    render(await AdminDashboardPage());

    expect(screen.getByText('7 published · 3 draft')).toBeInTheDocument();
  });

  it('shows tour upcoming dates', async () => {
    render(await AdminDashboardPage());

    expect(screen.getByText('8 upcoming dates')).toBeInTheDocument();
  });

  it('links to the videos section', async () => {
    render(await AdminDashboardPage());

    expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/admin/videos');
  });

  it('shows the video totals and breakdown', async () => {
    render(await AdminDashboardPage());

    expect(screen.getByText('4 published · 2 draft')).toBeInTheDocument();
  });

  it('renders the published-vs-unpublished chart', async () => {
    render(await AdminDashboardPage());

    expect(screen.getByTestId('dashboard-charts')).toBeInTheDocument();
  });

  it('no longer renders the section combobox', async () => {
    render(await AdminDashboardPage());

    expect(screen.queryByTestId('combobox')).not.toBeInTheDocument();
  });
});
