/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useCallback, useState } from 'react';

import { Share2Icon } from 'lucide-react';
import { toast } from 'sonner';

import type { FeaturedArtist } from '@/lib/types/media-models';
import { getDisplayName } from '@/lib/utils/get-display-name';

import { SocialShareWidget } from './social-share-widget';
import { Separator } from './ui/separator';

interface ArtistReleaseInfoProps {
  artistName: string;
  title: string;
  /** When true, the artist name heading is visible rather than screen-reader-only. */
  visibleHeading?: boolean;
  selectedArtist?: FeaturedArtist | null;
  featuredArtists?: FeaturedArtist[];
  setSelectedArtist?: (artist: FeaturedArtist | null) => void;
}

export const ArtistReleaseInfo = ({
  artistName,
  title,
  visibleHeading = false,
  selectedArtist = null,
  featuredArtists = [],
  setSelectedArtist,
}: ArtistReleaseInfoProps) => {
  const [artistUrl, setArtistUrl] = useState<string>(
    process.env.NEXT_PUBLIC_HOST_NAME || 'https://fakefourrecords.com'
  );
  const handleShare2IconClick = useCallback(() => {
    if (!selectedArtist) {
      featuredArtists.length > 0 && setSelectedArtist?.(featuredArtists.slice(1, 2)[0]);
      return;
    }

    const artistSlug = selectedArtist.artists?.[0]?.slug;
    const artistUrl = artistSlug
      ? `${process.env.NEXT_PUBLIC_HOST_NAME}/artists/${artistSlug}`
      : `${process.env.NEXT_PUBLIC_HOST_NAME}`;
    setArtistUrl(artistUrl);

    const shareData = {
      title: selectedArtist.release?.title || getDisplayName(selectedArtist),
      text: `Check out ${getDisplayName(selectedArtist)} on Fake Four Inc.!`,
      url: artistUrl,
    };

    if (navigator.share) {
      navigator
        .share(shareData)
        .then(() => toast.success('Content shared successfully!'))
        .catch(() => toast.error('Error sharing content'));
    } else {
      navigator.clipboard
        .writeText(artistUrl)
        .then(() => {
          toast.success('Artist link copied to clipboard!');
        })
        .catch(() => toast.error('Failed to copy link to clipboard'));
    }
  }, [featuredArtists, selectedArtist, setSelectedArtist]);
  return (
    <>
      <article className="flex flex-col justify-center text-sm gap-1 items-center px-2 -mb-1.5">
        <h2
          className={
            visibleHeading
              ? 'text-sm font-bold tracking-normal text-shadow-accent mb-0 pb-0 leading-0 mt-3'
              : 'sr-only text-lg font-semibold'
          }
          aria-label={`Now playing: ${artistName} - ${title}`}
        >
          {artistName}
        </h2>
        <p>
          <em>{title}</em>
        </p>
      </article>
      <div className="mt-3 ml-2 -mb-3 overflow-hidden">
        <span className="inline-block size-10 -mb-3.25">
          <Share2Icon onClick={handleShare2IconClick} size={22} className="ml-2 opacity-60" />
        </span>
        <SocialShareWidget artistUrl={artistUrl} />
      </div>
      <Separator className="bg-zinc-300 mx-auto mt-3 mb-1 min-h-px max-h-px max-w-[calc(100%-2rem)]" />
    </>
  );
};
