/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useState, useEffect, useCallback } from 'react';

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
  popoverWidth = 'w-[400px]',
  setValue,
  releaseId,
  disabled = false,
}: ArtistMultiSelectProps<TFieldValues, TName>) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch artists from API
  const fetchArtists = useCallback(async (search?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) {
        params.set('search', search);
      }
      params.set('take', '50');

      const response = await fetch(`/api/artists?${params.toString()}`);
      if (!response.ok) {
        throw Error('Failed to fetch artists');
      }

      const data: { artists: ArtistOption[] } = await response.json();
      setArtists(data.artists || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load artists';
      setError(errorMessage);
      setArtists([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch when popover opens
  useEffect(() => {
    if (open && artists.length === 0) {
      fetchArtists();
    }
  }, [open, artists.length, fetchArtists]);

  // Debounced search
  useEffect(() => {
    if (!open) return;

    const timeoutId = setTimeout(() => {
      fetchArtists(searchValue || undefined);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchValue, open, fetchArtists]);

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
    return parts.join(' ') || 'Unknown Artist';
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

        // Get selected artists for display
        const selectedArtists = artists.filter((artist) => selectedIds.includes(artist.id));

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
                <PopoverContent className={`${popoverWidth} p-0`} align="start">
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
                    <CommandList>
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
