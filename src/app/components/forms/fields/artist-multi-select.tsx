/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useEffect, useMemo, useState } from 'react';

import Link from 'next/link';

import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';

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
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/app/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { useArtistListQuery } from '@/app/hooks/use-artist-list-query';
import { useDebounce } from '@/app/hooks/use-debounce';

import type { Control, FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form';

export interface ArtistOption {
  id: string;
  displayName: string;
  firstName?: string;
  surname?: string;
}

interface ArtistMultiSelectProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  label: string | React.ReactNode;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  popoverWidth?: string;
  setValue?: UseFormSetValue<TFieldValues>;
  releaseId?: string | null;
  disabled?: boolean;
  initialArtists?: ArtistOption[];
}

export default function ArtistMultiSelect<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  placeholder = 'Select artists...',
  searchPlaceholder = 'Search artists...',
  emptyMessage = 'No artists found.',
  popoverWidth = 'w-[calc(100vw-2rem)] sm:w-[400px]',
  setValue,
  releaseId,
  disabled = false,
  initialArtists = [],
}: ArtistMultiSelectProps<TFieldValues, TName>) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedArtistCache, setSelectedArtistCache] = useState<Map<string, ArtistOption>>(
    () => new Map(initialArtists.map((a) => [a.id, a]))
  );

  const debouncedSearch = useDebounce(searchValue, 300);
  const {
    isPending: isLoading,
    error: fetchError,
    data,
  } = useArtistListQuery(
    { search: debouncedSearch || undefined, take: debouncedSearch ? undefined : 5 },
    open
  );
  const artists: ArtistOption[] = useMemo(
    () =>
      (data ?? []).map((item) => ({
        id: item.id,
        displayName:
          item.displayName ?? [item.firstName, item.surname].filter(Boolean).join(' ') ?? '',
        firstName: item.firstName ?? undefined,
        surname: item.surname ?? undefined,
      })),
    [data]
  );
  const error = fetchError?.message ?? null;

  // Sync cache when initialArtists changes (e.g. dialog reused for a different tour date)
  useEffect(() => {
    if (initialArtists.length === 0) return;
    setSelectedArtistCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const artist of initialArtists) {
        if (!next.has(artist.id)) {
          next.set(artist.id, artist);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [initialArtists]);

  // Whenever fetched artists change, cache them so selected pills persist across searches
  useEffect(() => {
    setSelectedArtistCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const artist of artists) {
        if (!next.has(artist.id)) {
          next.set(artist.id, artist);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [artists]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchValue('');
    }
  };

  const getArtistDisplayName = (artist: ArtistOption): string => {
    if (artist.displayName) {
      return artist.displayName;
    }
    const parts = [artist.firstName, artist.surname].filter(Boolean);
    return parts.join(' ') || '(no name)';
  };

  // Build the create artist URL with querystring parameters
  const getCreateArtistUrl = (): string => {
    const params = new URLSearchParams();
    if (releaseId) {
      params.set('returnTo', `/admin/releases/${releaseId}`);
      params.set('releaseId', releaseId);
    }
    const queryString = params.toString();
    return `/admin/artists/new${queryString ? `?${queryString}` : ''}`;
  };

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selectedIds = (field.value || []) as string[];

        const handleSelect = (artistId: string) => {
          const newValue = selectedIds.includes(artistId)
            ? selectedIds.filter((id) => id !== artistId)
            : [...selectedIds, artistId];

          if (setValue) {
            setValue(name, newValue as TFieldValues[TName], {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
          field.onChange(newValue);
        };

        const handleRemove = (artistId: string) => {
          const newValue = selectedIds.filter((id) => id !== artistId);
          if (setValue) {
            setValue(name, newValue as TFieldValues[TName], {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
          field.onChange(newValue);
        };

        // Get selected artists for display from cache (persists across searches)
        const selectedArtists = selectedIds
          .map((id) => selectedArtistCache.get(id))
          .filter((a): a is ArtistOption => a !== undefined);

        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <div className="space-y-2">
              <Popover open={open} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={open}
                      className="w-full justify-between"
                      disabled={disabled}
                    >
                      {selectedIds.length > 0
                        ? `${selectedIds.length} artist${selectedIds.length === 1 ? '' : 's'} selected`
                        : placeholder}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent
                  className={`${popoverWidth} p-0`}
                  align="start"
                  avoidCollisions
                  collisionPadding={8}
                  sideOffset={4}
                  onEscapeKeyDown={(e) => e.stopPropagation()}
                >
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder={searchPlaceholder}
                      value={searchValue}
                      onValueChange={setSearchValue}
                    />
                    <CommandEmpty>
                      {isLoading ? (
                        'Loading...'
                      ) : error ? (
                        <span className="text-destructive">{error}</span>
                      ) : (
                        <div className="flex flex-col items-center gap-2 py-2">
                          <span>{emptyMessage}</span>
                          <Link
                            href={getCreateArtistUrl()}
                            className="flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <Plus className="h-4 w-4" />
                            Create new artist
                          </Link>
                        </div>
                      )}
                    </CommandEmpty>
                    <CommandList
                      style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}
                    >
                      <CommandGroup>
                        {artists.map((artist) => (
                          <CommandItem
                            key={artist.id}
                            value={artist.id}
                            onSelect={() => handleSelect(artist.id)}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                selectedIds.includes(artist.id) ? 'opacity-100' : 'opacity-0'
                              }`}
                            />
                            {getArtistDisplayName(artist)}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                    <div className="border-t p-2">
                      <Link
                        href={getCreateArtistUrl()}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Plus className="h-4 w-4" />
                        Create new artist
                      </Link>
                    </div>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Display selected artists as badges */}
              {selectedArtists.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedArtists.map((artist) => (
                    <Badge key={artist.id} variant="secondary" className="gap-1">
                      {getArtistDisplayName(artist)}
                      <button
                        type="button"
                        onClick={() => handleRemove(artist.id)}
                        className="ml-1 rounded-full hover:bg-muted-foreground/20"
                        disabled={disabled}
                        aria-label={`Remove ${getArtistDisplayName(artist)}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
