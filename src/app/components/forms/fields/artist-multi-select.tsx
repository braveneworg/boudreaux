/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

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
import { useDebounce } from '@/hooks/use-debounce';

import { useFieldValidator } from './use-field-validator';
import { useArtistListQuery } from '../_hooks/use-artist-list-query';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';

export interface ArtistOption {
  id: string;
  displayName: string;
  firstName?: string;
  surname?: string;
}

const getArtistDisplayName = (artist: ArtistOption): string => {
  if (artist.displayName) {
    return artist.displayName;
  }
  const parts = [artist.firstName, artist.surname].filter(Boolean);
  return parts.join(' ') || '(no name)';
};

/**
 * Build the artist-list query params: when there's a search term it filters by
 * it with no `take` cap; otherwise it falls back to the first 5 artists.
 */
const buildArtistListParams = (
  debouncedSearch: string
): { search: string | undefined; take: number | undefined } => ({
  search: debouncedSearch || undefined,
  take: debouncedSearch ? undefined : 5,
});

const buildCreateArtistUrl = (releaseId: string | null | undefined): string => {
  const params = new URLSearchParams();
  if (releaseId) {
    params.set('returnTo', `/admin/releases/${releaseId}`);
    params.set('releaseId', releaseId);
  }
  const queryString = params.toString();
  return `/admin/artists/new${queryString ? `?${queryString}` : ''}`;
};

/**
 * Keeps a stable cache of {@link ArtistOption} keyed by id so selected pills
 * persist across searches and survive `initialArtists` changes (e.g. the
 * dialog being reused for a different tour date). Returns the cache map.
 */
const useArtistSelectionCache = (
  initialArtists: ArtistOption[],
  artists: ArtistOption[]
): Map<string, ArtistOption> => {
  const [cache, setCache] = useState<Map<string, ArtistOption>>(
    () => new Map(initialArtists.map((a) => [a.id, a]))
  );

  const mergeIntoCache = useCallback((incoming: ArtistOption[]): void => {
    if (incoming.length === 0) return;
    setCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const artist of incoming) {
        if (!next.has(artist.id)) {
          next.set(artist.id, artist);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => mergeIntoCache(initialArtists), [initialArtists, mergeIntoCache]);
  useEffect(() => mergeIntoCache(artists), [artists, mergeIntoCache]);

  return cache;
};

interface ArtistTriggerLabelProps {
  selectedCount: number;
  placeholder: string;
}

const ArtistTriggerLabel = ({ selectedCount, placeholder }: ArtistTriggerLabelProps) => (
  <>
    {selectedCount > 0
      ? `${selectedCount} artist${selectedCount === 1 ? '' : 's'} selected`
      : placeholder}
  </>
);

interface ArtistCommandEmptyProps {
  isLoading: boolean;
  error: string | null;
  emptyMessage: string;
  createArtistUrl: string;
}

const ArtistCommandEmpty = ({
  isLoading,
  error,
  emptyMessage,
  createArtistUrl,
}: ArtistCommandEmptyProps) => {
  if (isLoading) return <>Loading...</>;
  if (error) return <span className="text-destructive">{error}</span>;
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <span>{emptyMessage}</span>
      <Link
        href={createArtistUrl}
        className="text-primary flex items-center gap-1 text-sm hover:underline"
      >
        <Plus className="h-4 w-4" />
        Create new artist
      </Link>
    </div>
  );
};

interface ArtistOptionRowProps {
  artist: ArtistOption;
  isSelected: boolean;
  onSelect: (artistId: string) => void;
}

const ArtistOptionRow = ({ artist, isSelected, onSelect }: ArtistOptionRowProps) => (
  <CommandItem value={artist.id} onSelect={() => onSelect(artist.id)}>
    <Check className={`mr-2 h-4 w-4 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
    {getArtistDisplayName(artist)}
  </CommandItem>
);

interface SelectedArtistBadgesProps {
  selectedArtists: ArtistOption[];
  disabled: boolean;
  onRemove: (artistId: string) => void;
}

const SelectedArtistBadges = ({
  selectedArtists,
  disabled,
  onRemove,
}: SelectedArtistBadgesProps) => (
  <div className="flex flex-wrap gap-2">
    {selectedArtists.map((artist) => (
      <Badge key={artist.id} variant="secondary" className="gap-1">
        {getArtistDisplayName(artist)}
        <button
          type="button"
          onClick={() => onRemove(artist.id)}
          className="hover:bg-muted-foreground/20 ml-1"
          disabled={disabled}
          aria-label={`Remove ${getArtistDisplayName(artist)}`}
        >
          <X className="h-3 w-3" />
        </button>
      </Badge>
    ))}
  </div>
);

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
  /**
   * Report validation errors as soon as the selection changes rather than
   * waiting for the first submit. See {@link useFieldValidator}.
   */
  validateOnChange?: boolean;
  releaseId?: string | null;
  disabled?: boolean;
  initialArtists?: ArtistOption[];
}

export const ArtistMultiSelect = <
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
  validateOnChange,
  releaseId,
  disabled = false,
  initialArtists = [],
}: ArtistMultiSelectProps<TFieldValues, TName>) => {
  const validateField = useFieldValidator<TFieldValues>(name, validateOnChange);
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const debouncedSearch = useDebounce(searchValue, 300);
  const {
    isPending: isLoading,
    error: fetchError,
    data,
  } = useArtistListQuery(buildArtistListParams(debouncedSearch), { enabled: open });
  const artists: ArtistOption[] = useMemo(
    () =>
      (data ?? []).map((item) => ({
        id: item.id,
        displayName: item.displayName ?? [item.firstName, item.surname].filter(Boolean).join(' '),
        firstName: item.firstName ?? undefined,
        surname: item.surname ?? undefined,
      })),
    [data]
  );

  const selectedArtistCache = useArtistSelectionCache(initialArtists, artists);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchValue('');
    }
  };

  const createArtistUrl = buildCreateArtistUrl(releaseId);

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

          field.onChange(newValue);
          validateField();
        };

        const handleRemove = (artistId: string) => {
          const newValue = selectedIds.filter((id) => id !== artistId);
          field.onChange(newValue);
          validateField();
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
                      <ArtistTriggerLabel
                        selectedCount={selectedIds.length}
                        placeholder={placeholder}
                      />
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
                      <ArtistCommandEmpty
                        isLoading={isLoading}
                        error={fetchError?.message ?? null}
                        emptyMessage={emptyMessage}
                        createArtistUrl={createArtistUrl}
                      />
                    </CommandEmpty>
                    <CommandList
                      style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}
                    >
                      <CommandGroup>
                        {artists.map((artist) => (
                          <ArtistOptionRow
                            key={artist.id}
                            artist={artist}
                            isSelected={selectedIds.includes(artist.id)}
                            onSelect={handleSelect}
                          />
                        ))}
                      </CommandGroup>
                    </CommandList>
                    <div className="border-t p-2">
                      <Link
                        href={createArtistUrl}
                        className="text-primary flex items-center gap-1 text-sm hover:underline"
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
                <SelectedArtistBadges
                  selectedArtists={selectedArtists}
                  disabled={disabled}
                  onRemove={handleRemove}
                />
              )}
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};
