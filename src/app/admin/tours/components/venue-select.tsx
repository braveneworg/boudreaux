/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { createVenueAction } from '@/lib/actions/venue-actions';
import type { FormState } from '@/lib/types/form-state';
import { cn } from '@/lib/utils';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';

interface VenueOption {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
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
}

export default function VenueSelect<
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
}: VenueSelectProps<TFieldValues, TName>) {
  const [open, setOpen] = useState(false);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [searchValue, setSearchValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Dialog state for inline venue creation
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueCity, setNewVenueCity] = useState('');
  const [newVenueState, setNewVenueState] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const fetchVenues = async (search?: string) => {
    setIsLoading(true);
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/venues${query}`);
      if (res.ok) {
        const data = await res.json();
        setVenues(data.venues || []);
      }
    } catch (err) {
      console.error('Failed to fetch venues:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchVenues(searchValue);
    }
  }, [searchValue, open]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchValue('');
    }
  };

  const handleCreateVenue = async (field: { onChange: (value: string) => void }) => {
    if (!newVenueName.trim()) return;

    setIsCreating(true);
    try {
      const formData = new FormData();
      formData.append('name', newVenueName.trim());
      if (newVenueCity.trim()) formData.append('city', newVenueCity.trim());
      if (newVenueState.trim()) formData.append('state', newVenueState.trim());

      const initialFormState: FormState = { fields: {}, success: false };
      const result = await createVenueAction(initialFormState, formData);

      if (result.success && result.data?.venueId) {
        // Add new venue to list and select it
        const newVenue: VenueOption = {
          id: String(result.data.venueId),
          name: newVenueName.trim(),
          city: newVenueCity.trim() || null,
          state: newVenueState.trim() || null,
        };
        setVenues((prev) => [newVenue, ...prev]);
        field.onChange(newVenue.id);

        // Close dialog and reset form
        setDialogOpen(false);
        setNewVenueName('');
        setNewVenueCity('');
        setNewVenueState('');
        setOpen(false);
      }
    } catch (err) {
      console.error('Failed to create venue:', err);
    } finally {
      setIsCreating(false);
    }
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
            setOpen(false);
          };

          return (
            <FormItem className="flex flex-col">
              <FormLabel>{label}</FormLabel>
              <Popover open={open} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      disabled={disabled}
                      className={cn(
                        'w-full justify-between',
                        !selectedId && 'text-muted-foreground'
                      )}
                    >
                      {selectedVenue
                        ? `${selectedVenue.name}${selectedVenue.city ? ` - ${selectedVenue.city}` : ''}${selectedVenue.state ? `, ${selectedVenue.state}` : ''}`
                        : placeholder}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-100 p-0">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder={searchPlaceholder}
                      value={searchValue}
                      onValueChange={setSearchValue}
                    />
                    <CommandList>
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
              {description && <FormDescription>{description}</FormDescription>}
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Venue</DialogTitle>
            <DialogDescription>
              Add a new venue to the system. It will be immediately available for selection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="venue-name" className="text-sm font-medium">
                Venue Name *
              </label>
              <Input
                id="venue-name"
                value={newVenueName}
                onChange={(e) => setNewVenueName(e.target.value)}
                placeholder="Enter venue name"
                disabled={isCreating}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="venue-city" className="text-sm font-medium">
                City
              </label>
              <Input
                id="venue-city"
                value={newVenueCity}
                onChange={(e) => setNewVenueCity(e.target.value)}
                placeholder="Enter city"
                disabled={isCreating}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="venue-state" className="text-sm font-medium">
                State
              </label>
              <Input
                id="venue-state"
                value={newVenueState}
                onChange={(e) => setNewVenueState(e.target.value)}
                placeholder="Enter state"
                disabled={isCreating}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isCreating}>
              Cancel
            </Button>
            <FormField
              control={control}
              name={name}
              render={({ field }) => (
                <Button
                  onClick={() => handleCreateVenue(field)}
                  disabled={!newVenueName.trim() || isCreating}
                >
                  {isCreating ? 'Creating...' : 'Create Venue'}
                </Button>
              )}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
