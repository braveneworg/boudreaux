/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { LayoutDashboard } from 'lucide-react';

import { Card, CardContent } from '@/app/components/ui/card';
import { SectionHeader } from '@/app/components/ui/section-header';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { AdminStatsService } from '@/lib/services/admin-stats-service';
import type { AdminStats } from '@/lib/services/admin-stats-service';

import { ADMIN_NAV_ITEMS } from './components/admin-nav-items';
import { DashboardCharts } from './components/dashboard-charts';

export const dynamic = 'force-dynamic';

interface StatTile {
  href: string;
  primary: string;
  secondary: string;
}

/** Map the aggregated stats onto a tile for each admin section (importance order). */
const buildTiles = (stats: AdminStats): Record<string, StatTile> => ({
  '/admin/releases': {
    href: '/admin/releases',
    primary: `${stats.releases.total}`,
    secondary: `${stats.releases.published} published · ${stats.releases.draft} draft`,
  },
  '/admin/featured-artists': {
    href: '/admin/featured-artists',
    primary: `${stats.featuredArtists.total}`,
    secondary: 'featured on the site',
  },
  '/admin/artists': {
    href: '/admin/artists',
    primary: `${stats.artists.total}`,
    secondary: `${stats.artists.published} published`,
  },
  '/admin/notifications': {
    href: '/admin/notifications',
    primary: `${stats.notifications.activeSlots}`,
    secondary: 'active banner slots',
  },
  '/admin/announcements': {
    href: '/admin/announcements',
    primary: '—',
    secondary: 'send an SMS to subscribers',
  },
  '/admin/chat': {
    href: '/admin/chat',
    primary: `${stats.chat.flaggedUsers}`,
    secondary: `${stats.chat.flaggedUsers} flagged · ${stats.chat.disabledUsers} disabled`,
  },
  '/admin/tours': {
    href: '/admin/tours',
    primary: `${stats.tours.total}`,
    secondary: `${stats.tours.upcomingDates} upcoming dates`,
  },
  '/admin/logging': {
    href: '/admin/logging',
    primary: '—',
    secondary: 'adjust the runtime log level',
  },
  '/admin/settings': {
    href: '/admin/settings',
    primary: '—',
    secondary: 'site-wide settings',
  },
});

export default async function AdminDashboardPage() {
  const stats = await AdminStatsService.getStats();
  const tiles = buildTiles(stats);

  return (
    <ZinePanel
      accent="storm"
      tape={false}
      contentClassName="space-y-8"
      breadcrumbs={[{ anchorText: 'Admin', url: '/admin', isActive: true }]}
    >
      <SectionHeader
        icon={LayoutDashboard}
        title="Dashboard"
        helpText="An at-a-glance overview of your content and moderation queues. Each tile links to its section; the chart compares published and unpublished content."
      />

      <ul
        aria-label="Section overview"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {ADMIN_NAV_ITEMS.map((item) => {
          const tile = tiles[item.href];
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Card className="m-0 h-full transition-colors hover:border-zinc-500">
                <CardContent className="flex items-start gap-4 p-5">
                  <Icon className="text-primary mt-1 size-6 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <Link
                      href={item.href}
                      className="font-fake-four-cutout text-lg hover:underline"
                    >
                      {item.label}
                    </Link>
                    <p className="text-3xl leading-tight font-semibold tabular-nums">
                      {tile.primary}
                    </p>
                    <p className="text-muted-foreground text-sm">{tile.secondary}</p>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Published vs unpublished</h2>
        <DashboardCharts stats={stats} />
      </section>
    </ZinePanel>
  );
}
