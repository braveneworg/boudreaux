/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo, useState } from 'react';

import Image from 'next/image';

import { Check, ChevronsUpDown } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { cn } from '@/lib/utils';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

import { useArtistBioImagesQuery } from '../_hooks/use-artist-bio-images-query';
import { useArtistsQuery } from '../_hooks/use-artists-query';

/** How a pool row relates to the artist's display images, for the option badge. */
type ImageRole = 'display' | 'suggested' | null;

interface ArtistImageOption {
  id: string;
  src: string;
  artistId: string;
  artistName: string;
  caption?: string;
  altText?: string;
  role: ImageRole;
}

interface CoverArtImageComboboxProps {
  artistIds: string[];
  currentValue: string;
  disabled: boolean;
  isUploading: boolean;
  onSelect: (src: string) => void;
}

const imageRole = (image: BioStatusImage): ImageRole => {
  if (typeof image.displayOrder === 'number') return 'display';
  if (image.isPrimary) return 'suggested';
  return null;
};

const artistLabel = (
  artist: { displayName?: string | null; firstName?: string; surname?: string } | null | undefined
): string => {
  if (!artist) return '(no name)';
  return (
    artist.displayName ||
    [artist.firstName, artist.surname].filter(Boolean).join(' ') ||
    '(no name)'
  );
};

/**
 * "Or select from artist images": a cmdk combobox over the bio image pools of
 * the given artists — display images first, then the job's suggestions, then
 * the rest — so a release or featured-artist cover can reuse the same photo
 * the artist page shows without re-uploading it. Selecting an option hands
 * its CDN URL to the parent field.
 */
export const CoverArtImageCombobox = ({
  artistIds,
  currentValue,
  disabled,
  isUploading,
  onSelect,
}: CoverArtImageComboboxProps): React.ReactElement | null => {
  const [comboboxOpen, setComboboxOpen] = useState(false);

  const artistIdsKey = JSON.stringify([...artistIds].sort());
  const sortedArtistIds = useMemo<string[]>(() => JSON.parse(artistIdsKey), [artistIdsKey]);
  const { artistsById } = useArtistsQuery(sortedArtistIds);
  const { imagesByArtistId, isPending: isLoadingArtistImages } =
    useArtistBioImagesQuery(sortedArtistIds);

  const artistImages = useMemo<ArtistImageOption[]>(() => {
    const names = new Map(Object.entries(artistsById));
    const pools = new Map(Object.entries(imagesByArtistId));
    return sortedArtistIds.flatMap((artistId) =>
      (pools.get(artistId) ?? []).map<ArtistImageOption>((image) => ({
        id: image.id,
        src: image.url,
        artistId,
        artistName: artistLabel(names.get(artistId)),
        caption: image.title ?? undefined,
        altText: image.alt ?? undefined,
        role: imageRole(image),
      }))
    );
  }, [sortedArtistIds, artistsById, imagesByArtistId]);

  const getTriggerLabel = (): string => {
    if (isLoadingArtistImages) return 'Loading artist images...';
    const selectedImage = currentValue
      ? artistImages.find((img) => img.src === currentValue)
      : undefined;
    return selectedImage
      ? `${selectedImage.artistName} - image selected`
      : 'Choose from artist images...';
  };

  if (artistIds.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-950">Or select from artist images:</p>
      <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={comboboxOpen}
            className="w-full justify-between"
            disabled={disabled || isUploading || isLoadingArtistImages}
          >
            {getTriggerLabel()}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search artist images..." />
            <CommandEmpty>
              {isLoadingArtistImages ? 'Loading artist images...' : 'No artist images found.'}
            </CommandEmpty>
            <CommandList>
              <CommandGroup>
                {artistImages.map((img) => (
                  <CommandItem
                    key={img.id}
                    value={img.id}
                    onSelect={() => {
                      onSelect(img.src);
                      setComboboxOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        currentValue === img.src ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="relative mr-2 h-8 w-8 shrink-0 overflow-hidden">
                      <Image
                        src={img.src}
                        alt={img.altText || img.caption || 'Artist image'}
                        fill
                        className="object-cover"
                        sizes="32px"
                        unoptimized
                      />
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1 truncate text-sm">
                        {img.artistName}
                        {img.role === 'display' && (
                          <Badge variant="outline" className="text-[10px]">
                            Display
                          </Badge>
                        )}
                        {img.role === 'suggested' && (
                          <Badge variant="outline" className="text-[10px]">
                            Suggested
                          </Badge>
                        )}
                      </span>
                      {img.caption && (
                        <span className="truncate text-xs text-zinc-950">{img.caption}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
