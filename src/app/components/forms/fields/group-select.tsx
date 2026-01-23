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

export interface GroupOption {
  id: string;
  name: string;
  displayName?: string;
}

interface GroupSelectProps<
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
  onGroupChange?: (group: GroupOption | null) => void;
}

/**
 * Get display name for a group, using displayName if available,
 * otherwise falling back to name
 */
const getGroupDisplayName = (group: GroupOption): string => {
  return group.displayName || group.name || 'Unknown Group';
};

export default function GroupSelect<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  placeholder = 'Select a group...',
  searchPlaceholder = 'Search groups...',
  emptyMessage = 'No groups found.',
  popoverWidth = 'w-[400px]',
  setValue,
  disabled = false,
  showCreateLink = true,
  onGroupChange,
}: GroupSelectProps<TFieldValues, TName>) {
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

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selectedId = field.value as string | undefined;
        const selectedGroup = groups.find((g) => g.id === selectedId);

        const handleSelect = (groupId: string) => {
          const newValue = selectedId === groupId ? '' : groupId;
          const newGroup = newValue ? groups.find((g) => g.id === newValue) || null : null;

          if (setValue) {
            setValue(name, newValue as TFieldValues[TName], {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
          field.onChange(newValue);
          onGroupChange?.(newGroup);
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
          onGroupChange?.(null);
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
                      {selectedGroup ? getGroupDisplayName(selectedGroup) : placeholder}
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
                        Loading groups...
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
                            {groups.map((group) => (
                              <CommandItem
                                key={group.id}
                                value={group.id}
                                onSelect={() => handleSelect(group.id)}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${
                                    selectedId === group.id ? 'opacity-100' : 'opacity-0'
                                  }`}
                                />
                                <span className="flex-1">{getGroupDisplayName(group)}</span>
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
                              <Link href="/admin/groups/new">
                                <Plus className="mr-2 h-4 w-4" />
                                Create new group
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
