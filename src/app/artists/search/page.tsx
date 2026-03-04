/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Artist search results page at `/artists/search`.
 * Server Component that reads the `q` search param and displays matching
 * published artists with links to their detail pages.
 */
import 'server-only';

import Image from 'next/image';
import Link from 'next/link';

import { ArtistSearchInput } from '@/app/components/artist-search-input';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import { Heading } from '@/app/components/ui/heading';
import PageContainer from '@/app/components/ui/page-container';
import { ArtistService } from '@/lib/services/artist-service';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Search Artists',
  description: 'Search for artists by name.',
};

const breadcrumbItems = [
  { anchorText: 'Home', url: '/', isActive: false },
  { anchorText: 'Search Artists', url: '/artists/search', isActive: true },
];

interface ArtistSearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ArtistSearchPage({ searchParams }: ArtistSearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const query = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q : '';

  const result = query
    ? await ArtistService.searchPublishedArtists({ search: query })
    : { success: true as const, data: [] };

  const hasError = !result.success;
  const artists = result.success ? result.data : [];

  return (
    <PageContainer>
      <ContentContainer>
        <BreadcrumbMenu items={breadcrumbItems} />
        <Heading level={1}>Search Artists</Heading>
        <div className="px-4 py-2">
          <ArtistSearchInput />
        </div>

        {hasError ? (
          <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
            <p className="text-muted-foreground">
              Unable to search artists. Please try again later.
            </p>
            <Link
              href="/artists/search"
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </Link>
          </div>
        ) : artists.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <p className="text-muted-foreground">
              {query
                ? `No artists found for "${query}".`
                : 'Enter at least 3 characters to search.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2 px-4 py-4">
            {artists.map((artist) => {
              const displayName = getArtistDisplayName(artist);
              const thumbnail = artist.images?.[0];

              return (
                <li key={artist.id}>
                  <Link
                    href={`/artists/${artist.slug}`}
                    className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
                  >
                    {thumbnail ? (
                      <Image
                        src={thumbnail.src || ''}
                        alt={thumbnail.altText || displayName}
                        width={56}
                        height={56}
                        className="size-14 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex size-14 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium">{displayName}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ContentContainer>
    </PageContainer>
  );
}
