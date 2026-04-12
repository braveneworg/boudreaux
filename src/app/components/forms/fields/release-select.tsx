/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useState } from 'react';

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
import { useDebounce } from '@/app/hooks/use-debounce';
import { useReleaseListQuery } from '@/app/hooks/use-release-list-query';

import type { Control, FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form';

export interface ReleaseOption {
  id: string;
  title: string;
  releasedOn?: string | Date;
  artistReleases?: {
    artist: {
      id: string;
      firstName?: string | null;
      surname?: string | null;
      displayName?: string | null;
    };
  }[];
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
  artistIds?: string[];
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
  artistIds,
}: ReleaseSelectProps<TFieldValues, TName>) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const debouncedSearch = useDebounce(searchValue, 300);
  const {
    isPending: isLoading,
    error: fetchError,
    data,
  } = useReleaseListQuery(
    {
      search: debouncedSearch || undefined,
      artistIds: artistIds?.length ? artistIds : undefined,
      take: 50,
    },
    open
  );
  const releases = data ?? [];
  const error = fetchError?.message ?? null;

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
          // If already selected, just close — use the X button to clear
          if (selectedId === releaseId) {
            setOpen(false);
            return;
          }

          const newRelease = releases.find((r) => r.id === releaseId) || null;

          if (setValue) {
            setValue(name, releaseId as TFieldValues[TName], {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
          field.onChange(releaseId);
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
