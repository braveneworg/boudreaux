/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import type { AdminStats } from '@/lib/services/admin-stats-service';

import { DashboardCharts } from './dashboard-charts';

// ResponsiveContainer needs a measured DOM box that JSDOM lacks; stub it.
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

const stats: AdminStats = {
  releases: { total: 10, published: 7, draft: 3 },
  featuredArtists: { total: 3 },
  artists: { total: 20, published: 12 },
  notifications: { activeSlots: 2 },
  chat: { flaggedUsers: 4, disabledUsers: 1 },
  tours: { total: 5, upcomingDates: 8 },
};

describe('DashboardCharts', () => {
  it('renders a chart container', () => {
    render(<DashboardCharts stats={stats} />);

    expect(document.querySelector('[data-slot="chart"]')).toBeInTheDocument();
  });

  it('renders inside a responsive container', () => {
    const { getByTestId } = render(<DashboardCharts stats={stats} />);

    expect(getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('does not throw when all counts are zero', () => {
    const empty: AdminStats = {
      releases: { total: 0, published: 0, draft: 0 },
      featuredArtists: { total: 0 },
      artists: { total: 0, published: 0 },
      notifications: { activeSlots: 0 },
      chat: { flaggedUsers: 0, disabledUsers: 0 },
      tours: { total: 0, upcomingDates: 0 },
    };

    expect(() => render(<DashboardCharts stats={empty} />)).not.toThrow();
  });
});
