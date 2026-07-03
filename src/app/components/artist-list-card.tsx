/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Link from 'next/link';

import { ArrowRight, Music2, User } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent } from '@/app/components/ui/card';
import type { ArtistListWithBio } from '@/lib/types/media-models';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';

import { BioHtml } from './bio-html';
import { ExpandableThumbnail } from './expandable-thumbnail';

interface ArtistListCardProps {
  artist: ArtistListWithBio;
}

const splitList = (value: string | null | undefined): string[] =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

/**
 * Public artists-index card: a few identifying images, the short bio, genres,
 * and a "View more" link to the artist detail page. Mobile-first single column;
 * images sit above the text on small screens and beside it from `sm` up.
 *
 * @param artist - Published artist with its primary bio images.
 */
export const ArtistListCard = ({ artist }: ArtistListCardProps) => {
  const displayName = getArtistDisplayName(artist);
  const genres = splitList(artist.genres).slice(0, 3);
  const images = artist.bioImages;

  return (
    <Card className="shadow-zine-sm overflow-hidden bg-white">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row">
        {images.length > 0 ? (
          <ul className="flex shrink-0 gap-2">
            {images.map((image) => (
              <li key={image.id} className="size-20 sm:size-24">
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
        ) : (
          <div className="bg-muted flex size-20 shrink-0 items-center justify-center sm:size-24">
            <User className="text-muted-foreground size-8" aria-hidden />
          </div>
        )}

        <div className="min-w-0 space-y-2">
          <Link href={`/artists/${artist.slug}`} className="text-lg font-semibold hover:underline">
            {displayName}
          </Link>

          {genres.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {genres.map((genre) => (
                <li key={genre}>
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Music2 className="size-3" aria-hidden />
                    {genre}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          {artist.shortBio && (
            <BioHtml
              html={artist.shortBio}
              className="text-muted-foreground line-clamp-3 text-sm"
            />
          )}

          <Link
            href={`/artists/${artist.slug}`}
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            View more
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};
