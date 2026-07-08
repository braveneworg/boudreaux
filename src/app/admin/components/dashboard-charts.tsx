/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/app/components/ui/chart';
import type { ChartConfig } from '@/app/components/ui/chart';
import type { AdminStats } from '@/lib/services/admin-stats-service';

const chartConfig = {
  published: { label: 'Published', color: 'var(--chart-1)' },
  pending: { label: 'Unpublished', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export interface DashboardChartsProps {
  stats: AdminStats;
}

/**
 * Published-vs-unpublished breakdown for the content entities that track a
 * publish state. Rendered as a grouped, responsive bar chart that stacks
 * legibly down to mobile widths via the shared ChartContainer.
 */
export const DashboardCharts = ({ stats }: DashboardChartsProps): React.ReactElement => {
  const data = [
    {
      category: 'Releases',
      published: stats.releases.published,
      pending: stats.releases.draft,
    },
    {
      category: 'Videos',
      published: stats.videos.published,
      pending: stats.videos.draft,
    },
    {
      category: 'Artists',
      published: stats.artists.published,
      pending: stats.artists.total - stats.artists.published,
    },
  ];

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full sm:h-[260px]">
      <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="category" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="published" fill="var(--color-published)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="pending" fill="var(--color-pending)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
};
