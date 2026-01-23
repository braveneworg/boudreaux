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

export interface TrackOption {
  id: string;
  title: string;
  duration?: number;
}

interface TrackSelectProps<
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
  onTrackChange?: (track: TrackOption | null) => void;
}

/**
 * Format duration in seconds to MM:SS format
 */
const formatDuration = (seconds?: number): string => {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default function TrackSelect<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  placeholder = 'Select a track...',
  searchPlaceholder = 'Search tracks...',
  emptyMessage = 'No tracks found.',
  popoverWidth = 'w-[400px]',
  setValue,
  disabled = false,
  showCreateLink = true,
  onTrackChange,
}: TrackSelectProps<TFieldValues, TName>) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [tracks, setTracks] = useState<TrackOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch tracks from API
  const fetchTracks = useCallback(async (search?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) {
        params.set('search', search);
      }
      params.set('take', '50');

      const response = await fetch(`/api/tracks?${params.toString()}`);
      if (!response.ok) {
        throw Error('Failed to fetch tracks');
      }

      const data: { tracks: TrackOption[] } = await response.json();
      setTracks(data.tracks || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load tracks';
      setError(errorMessage);
      setTracks([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch when popover opens
  useEffect(() => {
    if (open && tracks.length === 0) {
      fetchTracks();
    }
  }, [open, tracks.length, fetchTracks]);

  // Debounced search
  useEffect(() => {
    if (!open) return;

    const timeoutId = setTimeout(() => {
      fetchTracks(searchValue || undefined);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchValue, open, fetchTracks]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchValue('');
    }
  };

  const getTrackDisplayName = (track: TrackOption): string => {
    const duration = formatDuration(track.duration);
    return duration ? `${track.title} (${duration})` : track.title;
  };

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selectedId = field.value as string | undefined;
        const selectedTrack = tracks.find((t) => t.id === selectedId);

        const handleSelect = (trackId: string) => {
          const newValue = selectedId === trackId ? '' : trackId;
          const newTrack = newValue ? tracks.find((t) => t.id === newValue) || null : null;

          if (setValue) {
            setValue(name, newValue as TFieldValues[TName], {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
          field.onChange(newValue);
          onTrackChange?.(newTrack);
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
          onTrackChange?.(null);
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
                      {selectedTrack ? getTrackDisplayName(selectedTrack) : placeholder}
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
                        Loading tracks...
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
                            {tracks.map((track) => (
                              <CommandItem
                                key={track.id}
                                value={track.id}
                                onSelect={() => handleSelect(track.id)}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${
                                    selectedId === track.id ? 'opacity-100' : 'opacity-0'
                                  }`}
                                />
                                <span className="flex-1">{getTrackDisplayName(track)}</span>
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
                              <Link href="/admin/tracks/new">
                                <Plus className="mr-2 h-4 w-4" />
                                Create new track
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
