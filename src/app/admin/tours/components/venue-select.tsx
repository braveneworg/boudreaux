/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { Check, ChevronsUpDown, Pencil, Plus } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { useVenueSearchQuery } from '@/app/hooks/use-venue-search-query';
import { cn } from '@/lib/utils';

import { useVenueCreateDialog } from './use-venue-create-dialog';
import { VenueCreateDialog } from './venue-create-dialog';
import { VenueEditDialog } from './venue-edit-dialog';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';

export interface VenueOption {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  timeZone?: string | null;
}

interface VenueSelectProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  label?: string;
  description?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  onVenueSelect?: (venue: VenueOption) => void;
}

export const VenueSelect = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label = 'Venue',
  description,
  placeholder = 'Select a venue...',
  searchPlaceholder = 'Search venues...',
  emptyMessage = 'No venues found.',
  disabled = false,
  onVenueSelect,
}: VenueSelectProps<TFieldValues, TName>) => {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editVenueId, setEditVenueId] = useState('');

  const createDialog = useVenueCreateDialog();

  const { isPending: isLoading, data: venuesData } = useVenueSearchQuery(searchValue, {
    enabled: open,
  });
  const venues = (venuesData ?? []) as VenueOption[];

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) setSearchValue('');
  };

  return (
    <>
      <FormField
        control={control}
        name={name}
        render={({ field }) => {
          const selectedId = field.value as string | undefined;
          const selectedVenue = venues.find((v) => v.id === selectedId);

          const handleSelect = (venueId: string) => {
            field.onChange(venueId);
            const venue = venues.find((v) => v.id === venueId);
            if (venue) onVenueSelect?.(venue);
            setOpen(false);
          };

          const venueLabel = selectedVenue
            ? `${selectedVenue.name}${selectedVenue.city ? ` - ${selectedVenue.city}` : ''}${selectedVenue.state ? `, ${selectedVenue.state}` : ''}`
            : placeholder;

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
                        disabled={disabled}
                        className={cn(
                          'w-full min-w-0 shrink justify-between',
                          !selectedId && 'text-zinc-950'
                        )}
                      >
                        <span className="truncate">{venueLabel}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[calc(100vw-2rem)] p-0 sm:w-100"
                    align="start"
                    avoidCollisions
                    collisionPadding={8}
                    sideOffset={4}
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder={searchPlaceholder}
                        value={searchValue}
                        onValueChange={setSearchValue}
                      />
                      <CommandList
                        style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}
                      >
                        <CommandEmpty>{isLoading ? 'Loading...' : emptyMessage}</CommandEmpty>
                        {venues.map((venue) => (
                          <CommandItem
                            key={venue.id}
                            value={venue.id}
                            onSelect={() => handleSelect(venue.id)}
                          >
                            {venue.name}
                            {venue.city && ` - ${venue.city}`}
                            {venue.state && `, ${venue.state}`}
                            <Check
                              className={cn(
                                'ml-auto h-4 w-4',
                                selectedId === venue.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                          </CommandItem>
                        ))}
                        <CommandItem
                          onSelect={() => {
                            setOpen(false);
                            setDialogOpen(true);
                          }}
                          className="border-t"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Create new venue
                        </CommandItem>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                      setEditVenueId(selectedId);
                      setEditDialogOpen(true);
                    }}
                    title="Edit venue"
                  >
                    <Pencil className="size-4" />
                  </Button>
                )}
              </div>
              {description && <FormDescription>{description}</FormDescription>}
              <FormMessage />
              <VenueCreateDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                dialog={createDialog}
                onChange={field.onChange}
                onVenueSelect={onVenueSelect}
                onSuccess={() => setOpen(false)}
              />
            </FormItem>
          );
        }}
      />

      <VenueEditDialog
        open={editDialogOpen}
        venueId={editVenueId}
        onOpenChange={setEditDialogOpen}
        onVenueSelect={onVenueSelect}
      />
    </>
  );
};
