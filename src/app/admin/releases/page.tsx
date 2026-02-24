/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { Plus } from 'lucide-react';

import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { ReleaseService } from '@/lib/services/release-service';
import { error as logError } from '@/lib/utils/console-logger';

export const dynamic = 'force-dynamic';

interface ReleaseListItem {
  id: string;
  title: string;
  releasedOn?: string | Date | null;
  publishedAt?: string | Date | null;
  coverArt?: string | null;
}

export default async function ReleasesPage() {
  let releases: ReleaseListItem[] = [];
  let fetchError: string | null = null;

  try {
    const result = await ReleaseService.getReleases({ take: 50 });

    if (result.success && Array.isArray(result.data)) {
      releases = result.data as ReleaseListItem[];
    } else if (!result.success) {
      fetchError = result.error ?? 'Failed to fetch releases';
      logError('ReleaseService.getReleases failed:', result.error);
    }
  } catch (err) {
    fetchError = 'An unexpected error occurred while loading releases';
    logError('ReleasesPage error:', err);
  }

  return (
    <div className="container mx-auto py-6">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Releases', url: '/admin/releases', isActive: true },
        ]}
      />

      <div className="mt-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Releases</h1>
        <Button asChild>
          <Link href="/admin/releases/new">
            <Plus className="mr-2 h-4 w-4" />
            New Release
          </Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-4">
        {fetchError ? (
          <Card>
            <CardContent className="py-8 text-center text-destructive">{fetchError}</CardContent>
          </Card>
        ) : releases.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No releases found. Create your first release to get started.
            </CardContent>
          </Card>
        ) : (
          releases.map((release) => (
            <Card key={release.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      <Link href={`/admin/releases/${release.id}`} className="hover:underline">
                        {release.title}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {release.releasedOn
                        ? new Date(release.releasedOn).toLocaleDateString()
                        : 'No release date'}
                      {' · '}
                      {release.publishedAt ? 'Published' : 'Draft'}
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/releases/${release.id}`}>Edit</Link>
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
