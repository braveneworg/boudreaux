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
    loading: () => <div className="bg-muted h-8 min-h-8 w-36 animate-pulse rounded" />,
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
      <div className="mx-auto mt-3 -mb-3 flex max-w-90 items-center justify-center overflow-hidden">
        <span className="-mb-3.25 inline-block size-10">
          <Share2Icon onClick={handleShare2IconClick} size={22} className="ml-2 opacity-60" />
        </span>
        <SocialShareWidget artistUrl={artistUrl} />
      </div>
      <Separator className="mx-auto mt-3 mb-1 max-h-px min-h-px max-w-[calc(100%-2rem)] bg-zinc-300" />
    </>
  );
};
