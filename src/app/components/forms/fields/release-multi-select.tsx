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

export interface ReleaseOption {
  id: string;
  title: string;
  releasedOn?: string | Date;
}

interface ReleaseMultiSelectProps<
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
  trackId?: string | null;
  disabled?: boolean;
  onReleasesChange?: (releases: ReleaseOption[]) => void;
}

export default function ReleaseMultiSelect<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  placeholder = 'Select releases...',
  searchPlaceholder = 'Search releases...',
  emptyMessage = 'No releases found.',
  popoverWidth = 'w-[400px]',
  setValue,
  trackId,
  disabled = false,
  onReleasesChange,
}: ReleaseMultiSelectProps<TFieldValues, TName>) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch releases from API
  const fetchReleases = useCallback(async (search?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) {
        params.set('search', search);
      }
      params.set('take', '50');

      const response = await fetch(`/api/releases?${params.toString()}`);
      if (!response.ok) {
        throw Error('Failed to fetch releases');
      }

      const data: { releases: ReleaseOption[] } = await response.json();
      setReleases(data.releases || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load releases';
      setError(errorMessage);
      setReleases([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch when popover opens
  useEffect(() => {
    if (open && releases.length === 0) {
      fetchReleases();
    }
  }, [open, releases.length, fetchReleases]);

  // Debounced search
  useEffect(() => {
    if (!open) return;

    const timeoutId = setTimeout(() => {
      fetchReleases(searchValue || undefined);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchValue, open, fetchReleases]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchValue('');
    }
  };

  const getReleaseDisplayName = (release: ReleaseOption): string => {
    if (release.releasedOn) {
      const year = new Date(release.releasedOn).getFullYear();
      return `${release.title} (${year})`;
    }
    return release.title;
  };

  // Build the create release URL with querystring parameters
  const getCreateReleaseUrl = (): string => {
    const params = new URLSearchParams();
    if (trackId) {
      params.set('returnTo', `/admin/tracks/${trackId}`);
      params.set('trackId', trackId);
    }
    const queryString = params.toString();
    return `/admin/releases/new${queryString ? `?${queryString}` : ''}`;
  };

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selectedIds = (field.value || []) as string[];

        const handleSelect = (releaseId: string) => {
          const newValue = selectedIds.includes(releaseId)
            ? selectedIds.filter((id) => id !== releaseId)
            : [...selectedIds, releaseId];

          if (setValue) {
            setValue(name, newValue as TFieldValues[TName], {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
          field.onChange(newValue);

          // Notify parent of selected releases
          if (onReleasesChange) {
            const selectedReleases = releases.filter((r) => newValue.includes(r.id));
            onReleasesChange(selectedReleases);
          }
        };

        const handleRemove = (releaseId: string) => {
          const newValue = selectedIds.filter((id) => id !== releaseId);
          if (setValue) {
            setValue(name, newValue as TFieldValues[TName], {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
          field.onChange(newValue);

          // Notify parent of selected releases
          if (onReleasesChange) {
            const selectedReleases = releases.filter((r) => newValue.includes(r.id));
            onReleasesChange(selectedReleases);
          }
        };

        // Get selected releases for display
        const selectedReleases = releases.filter((release) => selectedIds.includes(release.id));

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
                        ? `${selectedIds.length} release${selectedIds.length === 1 ? '' : 's'} selected`
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
                            href={getCreateReleaseUrl()}
                            className="flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <Plus className="h-4 w-4" />
                            Create new release
                          </Link>
                        </div>
                      )}
                    </CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {releases.map((release) => (
                          <CommandItem
                            key={release.id}
                            value={release.id}
                            onSelect={() => handleSelect(release.id)}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                selectedIds.includes(release.id) ? 'opacity-100' : 'opacity-0'
                              }`}
                            />
                            {getReleaseDisplayName(release)}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                    <div className="border-t p-2">
                      <Link
                        href={getCreateReleaseUrl()}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Plus className="h-4 w-4" />
                        Create new release
                      </Link>
                    </div>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Display selected releases as badges */}
              {selectedReleases.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedReleases.map((release) => (
                    <Badge key={release.id} variant="secondary" className="gap-1">
                      {getReleaseDisplayName(release)}
                      <button
                        type="button"
                        onClick={() => handleRemove(release.id)}
                        className="ml-1 rounded-full hover:bg-muted-foreground/20"
                        disabled={disabled}
                        aria-label={`Remove ${release.title}`}
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
