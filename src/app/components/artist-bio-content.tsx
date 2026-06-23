/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Loader2, Music2 } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { useArtistBySlugQuery } from '@/app/hooks/use-artist-by-slug-query';
import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';

import { BioHtml } from './bio-html';
import { ExpandableThumbnail } from './expandable-thumbnail';
import { BreadcrumbMenu } from './ui/breadcrumb-menu';

interface ArtistBioContentProps {
  slug: string;
}

const splitList = (value: string | null | undefined): string[] =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

/**
 * Client content for the full artist bio page at `/artists/[slug]/bio`.
 *
 * Renders the long (sanitized) bio, the full discovered-image gallery as
 * expandable thumbnails, genres, and external links (all `nofollow noopener
 * noreferrer`). Reuses the artist-by-slug query so navigating here from the
 * detail page hits the warm cache.
 */
export const ArtistBioContent = ({ slug }: ArtistBioContentProps) => {
  const { isPending, error, data } = useArtistBySlugQuery(slug);

  if (isPending) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="border-muted-foreground/25 flex min-h-100 items-center justify-center rounded-lg border-2 border-dashed p-8 text-center">
        <div>
          <h3 className="text-lg font-semibold">
            {error ? 'Failed to load bio' : 'Artist not found'}
          </h3>
          <p className="text-muted-foreground mt-2 text-sm">
            {error ? 'Please try again later.' : 'The artist you are looking for does not exist.'}
          </p>
        </div>
      </div>
    );
  }

  const artist = data as unknown as ArtistWithPublishedReleases;
  const displayName = getArtistDisplayName(artist);
  const genres = splitList(artist.genres);
  const { bioImages } = artist;

  const breadcrumbItems = [
    { anchorText: 'Home', url: '/', isActive: false },
    { anchorText: 'Artists', url: '/artists', isActive: false },
    {
      anchorText: displayName,
      url: `/artists/${slug}`,
      isActive: false,
      className: 'max-w-[160px] truncate sm:max-w-none',
    },
    { anchorText: 'Bio', url: `/artists/${slug}/bio`, isActive: true },
  ];

  return (
    <div className="space-y-6">
      <BreadcrumbMenu items={breadcrumbItems} />

      <header className="space-y-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">{displayName}</h1>
        {genres.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {genres.map((genre) => (
              <li key={genre}>
                <Badge variant="secondary" className="gap-1">
                  <Music2 className="size-3" aria-hidden />
                  {genre}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {artist.shortBio && (
          <BioHtml html={artist.shortBio} className="text-muted-foreground text-lg" />
        )}
      </header>

      {bioImages.length > 0 && (
        <section aria-label="Artist images">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {bioImages.map((image) => (
              <li key={image.id} className="aspect-square">
                <ExpandableThumbnail
                  src={image.url}
                  thumbnailSrc={image.thumbnailUrl}
                  alt={image.title ?? `${displayName} image`}
                  caption={image.title}
                  attribution={image.attribution}
                  license={image.license}
                  sourceUrl={image.sourceUrl}
                  className="size-full"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {artist.bio ? (
        <article className="max-w-none [&_h2]:mt-10 [&_h2]:border-t [&_h2]:pt-6 [&_h3]:mt-6">
          {/* The bio HTML is sanitized server-side on read (sanitizeBioHtml) and
              again at generation time; BioHtml maps its <a>/<img> tags to Next
              Link/Image instead of dangerouslySetInnerHTML. Links are woven
              inline in the prose, so there is no separate link list. Section
              <h2>s get top spacing + a rule to visually separate sections. */}
          <BioHtml html={artist.bio} />
        </article>
      ) : (
        <p className="text-muted-foreground">No biography has been written for this artist yet.</p>
      )}
    </div>
  );
};
