/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useState, useEffect, useCallback } from 'react';

import Link from 'next/link';

import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';

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

interface ReleaseSelectProps<
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
  disabled?: boolean;
  showCreateLink?: boolean;
  onReleaseChange?: (release: ReleaseOption | null) => void;
}

export default function ReleaseSelect<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  placeholder = 'Select a release...',
  searchPlaceholder = 'Search releases...',
  emptyMessage = 'No releases found.',
  popoverWidth = 'w-[400px]',
  setValue,
  disabled = false,
  showCreateLink = true,
  onReleaseChange,
}: ReleaseSelectProps<TFieldValues, TName>) {
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

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selectedId = field.value as string | undefined;
        const selectedRelease = releases.find((r) => r.id === selectedId);

        const handleSelect = (releaseId: string) => {
          const newValue = selectedId === releaseId ? '' : releaseId;
          const newRelease = newValue ? releases.find((r) => r.id === newValue) || null : null;

          if (setValue) {
            setValue(name, newValue as TFieldValues[TName], {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
          field.onChange(newValue);
          onReleaseChange?.(newRelease);
          setOpen(false);
        };

        const handleClear = () => {
          if (setValue) {
            setValue(name, '' as TFieldValues[TName], {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
          field.onChange('');
          onReleaseChange?.(null);
        };

        return (
          <FormItem className="flex flex-col">
            <FormLabel>{label}</FormLabel>
            <div className="flex items-center gap-2">
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
                      {selectedRelease ? getReleaseDisplayName(selectedRelease) : placeholder}
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
                    {isLoading && (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        Loading releases...
                      </div>
                    )}
                    {error && (
                      <div className="py-6 text-center text-sm text-destructive">{error}</div>
                    )}
                    {!isLoading && !error && (
                      <>
                        <CommandEmpty>{emptyMessage}</CommandEmpty>
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
                                    selectedId === release.id ? 'opacity-100' : 'opacity-0'
                                  }`}
                                />
                                <span className="flex-1">{getReleaseDisplayName(release)}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                        {showCreateLink && (
                          <div className="border-t p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start"
                              asChild
                            >
                              <Link href="/admin/releases/new">
                                <Plus className="mr-2 h-4 w-4" />
                                Create new release
                              </Link>
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleClear}
                  disabled={disabled}
                  className="h-10 w-10 shrink-0"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Clear selection</span>
                </Button>
              )}
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
