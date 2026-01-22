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

interface GroupArtist {
  id: string;
  firstName?: string;
  surname?: string;
  displayName?: string;
}

export interface GroupOption {
  id: string;
  name: string;
  displayName?: string;
  artistGroups?: Array<{
    artist: GroupArtist;
  }>;
}

interface GroupMultiSelectProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  popoverWidth?: string;
  setValue?: UseFormSetValue<TFieldValues>;
  releaseId?: string | null;
  disabled?: boolean;
  onGroupsChange?: (groups: GroupOption[]) => void;
}

/**
 * Get display name for an artist, using displayName if available,
 * otherwise falling back to firstName + surname
 */
const getArtistDisplayName = (artist: GroupArtist): string => {
  if (artist.displayName) {
    return artist.displayName;
  }
  const parts = [artist.firstName, artist.surname].filter(Boolean);
  return parts.join(' ') || 'Unknown Artist';
};

/**
 * Get display name for a group, using displayName if available,
 * otherwise falling back to name
 */
const getGroupDisplayName = (group: GroupOption): string => {
  return group.displayName || group.name || 'Unknown Group';
};

export default function GroupMultiSelect<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  placeholder = 'Select groups...',
  searchPlaceholder = 'Search groups...',
  emptyMessage = 'No groups found.',
  popoverWidth = 'w-[400px]',
  setValue,
  releaseId,
  disabled = false,
  onGroupsChange,
}: GroupMultiSelectProps<TFieldValues, TName>) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch groups from API
  const fetchGroups = useCallback(async (search?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) {
        params.set('search', search);
      }
      params.set('take', '50');

      const response = await fetch(`/api/groups?${params.toString()}`);
      if (!response.ok) {
        throw Error('Failed to fetch groups');
      }

      const data: { groups: GroupOption[] } = await response.json();
      setGroups(data.groups || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load groups';
      setError(errorMessage);
      setGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch when popover opens
  useEffect(() => {
    if (open && groups.length === 0) {
      fetchGroups();
    }
  }, [open, groups.length, fetchGroups]);

  // Debounced search
  useEffect(() => {
    if (!open) return;

    const timeoutId = setTimeout(() => {
      fetchGroups(searchValue || undefined);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchValue, open, fetchGroups]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchValue('');
    }
  };

  // Build the create group URL with querystring parameters
  const getCreateGroupUrl = (): string => {
    const params = new URLSearchParams();
    if (releaseId) {
      params.set('returnTo', `/admin/releases/${releaseId}`);
      params.set('releaseId', releaseId);
    }
    const queryString = params.toString();
    return `/admin/groups/new${queryString ? `?${queryString}` : ''}`;
  };

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selectedIds = (field.value || []) as string[];

        const handleSelect = (groupId: string) => {
          const newValue = selectedIds.includes(groupId)
            ? selectedIds.filter((id) => id !== groupId)
            : [...selectedIds, groupId];

          if (setValue) {
            setValue(name, newValue as TFieldValues[TName], {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
          field.onChange(newValue);

          // Notify parent of selected groups with their data
          if (onGroupsChange) {
            const selectedGroups = groups.filter((group) => newValue.includes(group.id));
            onGroupsChange(selectedGroups);
          }
        };

        const handleRemove = (groupId: string) => {
          const newValue = selectedIds.filter((id) => id !== groupId);
          if (setValue) {
            setValue(name, newValue as TFieldValues[TName], {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
          field.onChange(newValue);

          // Notify parent of selected groups with their data
          if (onGroupsChange) {
            const selectedGroups = groups.filter((group) => newValue.includes(group.id));
            onGroupsChange(selectedGroups);
          }
        };

        // Get selected groups for display
        const selectedGroups = groups.filter((group) => selectedIds.includes(group.id));

        // Format the display of group artists
        const formatGroupArtists = (selectedGroupsList: GroupOption[]): string => {
          return selectedGroupsList
            .map((group) => {
              const groupName = getGroupDisplayName(group);
              const artists =
                group.artistGroups?.map((ag) => getArtistDisplayName(ag.artist)) || [];
              const artistList = artists.length > 0 ? artists.join(', ') : 'No artists';
              return `${groupName}: ${artistList}`;
            })
            .join('; ');
        };

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
                        ? `${selectedIds.length} group${selectedIds.length === 1 ? '' : 's'} selected`
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
                            href={getCreateGroupUrl()}
                            className="flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <Plus className="h-4 w-4" />
                            Create new group
                          </Link>
                        </div>
                      )}
                    </CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {groups.map((group) => (
                          <CommandItem
                            key={group.id}
                            value={group.id}
                            onSelect={() => handleSelect(group.id)}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                selectedIds.includes(group.id) ? 'opacity-100' : 'opacity-0'
                              }`}
                            />
                            <div className="flex flex-col">
                              <span>{getGroupDisplayName(group)}</span>
                              {group.artistGroups && group.artistGroups.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {group.artistGroups
                                    .map((ag) => getArtistDisplayName(ag.artist))
                                    .join(', ')}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                    <div className="border-t p-2">
                      <Link
                        href={getCreateGroupUrl()}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Plus className="h-4 w-4" />
                        Create new group
                      </Link>
                    </div>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Display selected groups as badges */}
              {selectedGroups.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedGroups.map((group) => (
                    <Badge key={group.id} variant="secondary" className="gap-1">
                      {getGroupDisplayName(group)}
                      <button
                        type="button"
                        onClick={() => handleRemove(group.id)}
                        className="ml-1 rounded-full hover:bg-muted-foreground/20"
                        disabled={disabled}
                        aria-label={`Remove ${getGroupDisplayName(group)}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Display artists from selected groups */}
              {selectedGroups.length > 0 &&
                selectedGroups.some((g) => g.artistGroups && g.artistGroups.length > 0) && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    <span className="font-medium">{formatGroupArtists(selectedGroups)}</span>
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
