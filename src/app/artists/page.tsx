/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Public artists index at `/artists`.
 * Server Component that lists published artists with their short bios and a few
 * identifying images. Fetches directly via the service (server-only) — no
 * internal HTTP roundtrip — and renders static cards (no client query needed).
 */

import Link from 'next/link';

import { Search, Users } from 'lucide-react';

import { ArtistListCard } from '@/app/components/artist-list-card';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Button } from '@/app/components/ui/button';
import { ContentContainer } from '@/app/components/ui/content-container';
import { Heading } from '@/app/components/ui/heading';
import { PageContainer } from '@/app/components/ui/page-container';
import { ArtistService } from '@/lib/services/artist-service';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Artists',
  description: 'Browse artists on the label, with bios, images, and releases.',
};

const breadcrumbItems = [
  { anchorText: 'Home', url: '/', isActive: false },
  { anchorText: 'Artists', url: '/artists', isActive: true },
];

export default async function ArtistsIndexPage() {
  const result = await ArtistService.listPublishedArtists();
  const artists = result.success ? result.data : [];

  return (
    <PageContainer>
      <ContentContainer>
        <div className="space-y-6">
          <BreadcrumbMenu items={breadcrumbItems} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Heading level={1}>Artists</Heading>
            <Button asChild variant="outline" size="sm">
              <Link href="/artists/search">
                <Search className="size-4" aria-hidden />
                Search artists
              </Link>
            </Button>
          </div>

          {artists.length === 0 ? (
            <div className="border-muted-foreground/25 flex min-h-60 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center">
              <Users className="text-muted-foreground size-8" aria-hidden />
              <p className="text-muted-foreground">
                {result.success
                  ? 'No artists have been published yet.'
                  : 'Artists are unavailable right now. Please try again later.'}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {artists.map((artist) => (
                <li key={artist.id}>
                  <ArtistListCard artist={artist} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </ContentContainer>
    </PageContainer>
  );
}
