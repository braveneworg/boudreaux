/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useMemo, useState } from 'react';

import Image from 'next/image';

import { Check, ChevronsUpDown } from 'lucide-react';

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
import { getArtistImagesAction } from '@/lib/actions/artist-image-actions';
import { cn } from '@/lib/utils';

import { useArtistsQuery } from '../_hooks/use-artists-query';

interface ArtistImageOption {
  id: string;
  src: string;
  artistId: string;
  artistName: string;
  caption?: string;
  altText?: string;
}

interface CoverArtImageComboboxProps {
  artistIds: string[];
  currentValue: string;
  disabled: boolean;
  isUploading: boolean;
  onSelect: (src: string) => void;
}

export const CoverArtImageCombobox = ({
  artistIds,
  currentValue,
  disabled,
  isUploading,
  onSelect,
}: CoverArtImageComboboxProps): React.ReactElement | null => {
  const [rawArtistImages, setRawArtistImages] = useState<ArtistImageOption[]>([]);
  const [isLoadingArtistImages, setIsLoadingArtistImages] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);

  const artistIdsKey = JSON.stringify([...artistIds].sort());
  const sortedArtistIds = useMemo<string[]>(() => JSON.parse(artistIdsKey), [artistIdsKey]);
  const { artistsById } = useArtistsQuery(sortedArtistIds);

  const nameByArtistId = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const [id, artist] of Object.entries(artistsById)) {
      map.set(
        id,
        artist
          ? artist.displayName ||
              [artist.firstName, artist.surname].filter(Boolean).join(' ') ||
              '(no name)'
          : '(no name)'
      );
    }
    return map;
  }, [artistsById]);

  const artistImages = useMemo<ArtistImageOption[]>(
    () =>
      rawArtistImages.map((img) => ({
        ...img,
        artistName: nameByArtistId.get(img.artistId) ?? '(no name)',
      })),
    [rawArtistImages, nameByArtistId]
  );

  useEffect(() => {
    const parsedIds: string[] = JSON.parse(artistIdsKey);
    if (parsedIds.length === 0) {
      setRawArtistImages([]);
      return;
    }

    let cancelled = false;

    const fetchArtistImages = async () => {
      setIsLoadingArtistImages(true);
      try {
        const imageResults = await Promise.all(
          parsedIds.map(async (artistId) => {
            const imagesResult = await getArtistImagesAction(artistId);
            if (imagesResult.success && imagesResult.data) {
              return imagesResult.data.map<ArtistImageOption>((img) => ({
                id: img.id,
                src: img.src,
                artistId,
                artistName: '(no name)',
                caption: img.caption,
                altText: img.altText,
              }));
            }
            return [];
          })
        );
        if (!cancelled) setRawArtistImages(imageResults.flat());
      } catch (err) {
        console.error('Failed to fetch artist images:', err);
      } finally {
        if (!cancelled) setIsLoadingArtistImages(false);
      }
    };

    fetchArtistImages();
    return () => {
      cancelled = true;
    };
  }, [artistIdsKey]);

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
                      <span className="truncate text-sm">{img.artistName}</span>
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
