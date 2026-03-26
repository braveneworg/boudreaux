/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { BarChart3, Download, Users } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';

interface FormatBreakdown {
  formatType: string;
  count: number;
}

interface AnalyticsData {
  totalDownloads: number;
  uniqueUsers: number;
  formatBreakdown: FormatBreakdown[];
}

interface DownloadAnalyticsDashboardProps {
  releaseId: string;
}

const DATE_RANGE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
] as const;

const FORMAT_LABELS: Record<string, string> = {
  MP3_V0: 'MP3 V0',
  MP3_320KBPS: 'MP3 320kbps',
  AAC: 'AAC',
  OGG_VORBIS: 'Ogg Vorbis',
  FLAC: 'FLAC',
  ALAC: 'ALAC',
  WAV: 'WAV',
  AIFF: 'AIFF',
};

function getDateRange(range: string): { startDate?: string; endDate?: string } {
  if (range === 'all') return {};
  const days = parseInt(range);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

export function DownloadAnalyticsDashboard({ releaseId }: DownloadAnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('all');

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      const range = getDateRange(dateRange);
      if (range.startDate) params.set('startDate', range.startDate);
      if (range.endDate) params.set('endDate', range.endDate);

      const queryString = params.toString();
      const url = `/api/releases/${releaseId}/download-analytics${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setAnalytics({
          totalDownloads: data.totalDownloads,
          uniqueUsers: data.uniqueUsers,
          formatBreakdown: data.formatBreakdown,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [releaseId, dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const totalFormatDownloads = analytics?.formatBreakdown.reduce(
    (sum, item) => sum + item.count,
    0
  );

  return (
    <div className="space-y-4" data-testid="download-analytics-dashboard">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Download Analytics</h3>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-40" data-testid="date-range-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center text-sm" data-testid="loading">
          Loading analytics...
        </div>
      ) : !analytics ? (
        <div className="text-muted-foreground py-8 text-center text-sm" data-testid="error">
          Failed to load analytics
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Downloads</CardTitle>
                <Download className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="total-downloads">
                  {analytics.totalDownloads}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
                <Users className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="unique-users">
                  {analytics.uniqueUsers}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Formats</CardTitle>
                <BarChart3 className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="format-count">
                  {analytics.formatBreakdown.length}
                </div>
              </CardContent>
            </Card>
          </div>

          {analytics.formatBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Downloads by Format</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Format</TableHead>
                      <TableHead className="text-right">Downloads</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.formatBreakdown.map((item) => (
                      <TableRow key={item.formatType} data-testid={`format-row-${item.formatType}`}>
                        <TableCell>{FORMAT_LABELS[item.formatType] ?? item.formatType}</TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right">
                          {totalFormatDownloads
                            ? `${((item.count / totalFormatDownloads) * 100).toFixed(1)}%`
                            : '0%'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
