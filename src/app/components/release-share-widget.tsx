/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useCallback, useMemo } from 'react';

import nextDynamic from 'next/dynamic';

import { Share2Icon } from 'lucide-react';
import { toast } from 'sonner';

import type { FeaturedArtist } from '@/lib/types/media-models';
import { getDisplayName } from '@/lib/utils/get-display-name';

import { Separator } from './ui/separator';

const SocialShareWidget = nextDynamic(
  () => import('./social-share-widget').then((mod) => ({ default: mod.SocialShareWidget })),
  {
    ssr: false,
    loading: () => <div className="h-8 w-36 min-h-8 animate-pulse bg-muted rounded" />,
  }
);

const hasErrorName = (error: unknown): error is { name: string } => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as { name: unknown }).name === 'string'
  );
};

interface ReleaseShareWidgetProps {
  selectedArtist?: FeaturedArtist | null;
  featuredArtists?: FeaturedArtist[];
  setSelectedArtist?: (artist: FeaturedArtist | null) => void;
}

export const ReleaseShareWidget = ({
  selectedArtist = null,
  featuredArtists = [],
  setSelectedArtist,
}: ReleaseShareWidgetProps) => {
  const baseUrl = process.env.NEXT_PUBLIC_HOST_NAME ?? 'https://fakefourrecords.com';

  const artistUrl = useMemo(() => {
    const artistSlug = selectedArtist?.artists?.[0]?.slug;
    return artistSlug ? `${baseUrl}/artists/${artistSlug}` : baseUrl;
  }, [baseUrl, selectedArtist]);

  const handleShare2IconClick = useCallback(() => {
    if (!selectedArtist) {
      featuredArtists.length > 0 && setSelectedArtist?.(featuredArtists.slice(1, 2)[0]);
      return;
    }

    const shareData = {
      title: selectedArtist.release?.title || getDisplayName(selectedArtist),
      text: `Check out ${getDisplayName(selectedArtist)} on Fake Four Inc.!`,
      url: artistUrl,
    };

    if (navigator.share) {
      navigator
        .share(shareData)
        .then(() => toast.success('Content shared successfully!'))
        .catch((error: unknown) => {
          if (hasErrorName(error) && error.name === 'AbortError') {
            return;
          }
          toast.error('Error sharing content');
        });
    } else {
      navigator.clipboard
        .writeText(artistUrl)
        .then(() => {
          toast.success('Artist link copied to clipboard!');
        })
        .catch(() => toast.error('Failed to copy link to clipboard'));
    }
  }, [artistUrl, featuredArtists, selectedArtist, setSelectedArtist]);
  return (
    <>
      <div className="max-w-90 mx-auto mt-3 -mb-3 overflow-hidden flex justify-center items-center">
        <span className="inline-block size-10 -mb-3.25">
          <Share2Icon onClick={handleShare2IconClick} size={22} className="ml-2 opacity-60" />
        </span>
        <SocialShareWidget artistUrl={artistUrl} />
      </div>
      <Separator className="bg-zinc-300 mx-auto mt-3 mb-1 min-h-px max-h-px max-w-[calc(100%-2rem)]" />
    </>
  );
};
