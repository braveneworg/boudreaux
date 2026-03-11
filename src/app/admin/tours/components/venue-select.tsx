/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

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
import { Skeleton } from '@/app/components/ui/skeleton';
import { TimezoneSelect } from '@/app/components/ui/timezone-select';
import { createVenueAction, updateVenueAction } from '@/lib/actions/venue-actions';
import type { FormState } from '@/lib/types/form-state';
import { cn } from '@/lib/utils';

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
  onVenueSelect,
}: VenueSelectProps<TFieldValues, TName>) {
  const [open, setOpen] = useState(false);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [searchValue, setSearchValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Dialog state for inline venue creation
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueAddress, setNewVenueAddress] = useState('');
  const [newVenueCity, setNewVenueCity] = useState('');
  const [newVenueState, setNewVenueState] = useState('');
  const [newVenuePostalCode, setNewVenuePostalCode] = useState('');
  const [newVenueCountry, setNewVenueCountry] = useState('');
  const [newVenueTimeZone, setNewVenueTimeZone] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Dialog state for inline venue editing
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isLoadingVenue, setIsLoadingVenue] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [editVenueId, setEditVenueId] = useState('');
  const [editVenueName, setEditVenueName] = useState('');
  const [editVenueAddress, setEditVenueAddress] = useState('');
  const [editVenueCity, setEditVenueCity] = useState('');
  const [editVenueState, setEditVenueState] = useState('');
  const [editVenuePostalCode, setEditVenuePostalCode] = useState('');
  const [editVenueCountry, setEditVenueCountry] = useState('');
  const [editVenueTimeZone, setEditVenueTimeZone] = useState('');

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
    setCreateError(null);
    try {
      const formData = new FormData();
      formData.append('name', newVenueName.trim());
      if (newVenueAddress.trim()) formData.append('address', newVenueAddress.trim());
      if (newVenueCity.trim()) formData.append('city', newVenueCity.trim());
      if (newVenueState.trim()) formData.append('state', newVenueState.trim());
      if (newVenuePostalCode.trim()) formData.append('postalCode', newVenuePostalCode.trim());
      if (newVenueCountry.trim()) formData.append('country', newVenueCountry.trim());
      if (newVenueTimeZone) formData.append('timeZone', newVenueTimeZone);

      const initialFormState: FormState = { fields: {}, success: false };
      const result = await createVenueAction(initialFormState, formData);

      if (result.success && result.data?.venueId) {
        const newVenue: VenueOption = {
          id: String(result.data.venueId),
          name: newVenueName.trim(),
          city: newVenueCity.trim() || null,
          state: newVenueState.trim() || null,
          timeZone: newVenueTimeZone || null,
        };
        setVenues((prev) => [newVenue, ...prev]);
        field.onChange(newVenue.id);
        onVenueSelect?.(newVenue);

        // Close dialog and reset form
        setDialogOpen(false);
        setNewVenueName('');
        setNewVenueAddress('');
        setNewVenueCity('');
        setNewVenueState('');
        setNewVenuePostalCode('');
        setNewVenueCountry('');
        setNewVenueTimeZone('');
        setOpen(false);
      } else {
        // Surface validation or server errors
        const errors = result.errors ?? {};
        const firstError =
          Object.values(errors).flat()[0] ?? 'Failed to create venue. Please try again.';
        setCreateError(String(firstError));
      }
    } catch (err) {
      console.error('Failed to create venue:', err);
      setCreateError('An unexpected error occurred. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const fetchVenueDetails = async (venueId: string) => {
    setIsLoadingVenue(true);
    setUpdateError(null);
    try {
      const res = await fetch(`/api/venues/${venueId}`);
      if (res.ok) {
        const { venue } = await res.json();
        setEditVenueId(venue.id);
        setEditVenueName(venue.name || '');
        setEditVenueAddress(venue.address || '');
        setEditVenueCity(venue.city || '');
        setEditVenueState(venue.state || '');
        setEditVenuePostalCode(venue.postalCode || '');
        setEditVenueCountry(venue.country || '');
        setEditVenueTimeZone(venue.timeZone || '');
      } else {
        setUpdateError('Failed to load venue details.');
      }
    } catch (err) {
      console.error('Failed to fetch venue details:', err);
      setUpdateError('Failed to load venue details.');
    } finally {
      setIsLoadingVenue(false);
    }
  };

  const handleEditVenue = async () => {
    if (!editVenueName.trim()) return;

    setIsUpdating(true);
    setUpdateError(null);
    try {
      const formData = new FormData();
      formData.append('name', editVenueName.trim());
      if (editVenueAddress.trim()) formData.append('address', editVenueAddress.trim());
      formData.append('city', editVenueCity.trim());
      if (editVenueState.trim()) formData.append('state', editVenueState.trim());
      if (editVenuePostalCode.trim()) formData.append('postalCode', editVenuePostalCode.trim());
      if (editVenueCountry.trim()) formData.append('country', editVenueCountry.trim());
      if (editVenueTimeZone) formData.append('timeZone', editVenueTimeZone);

      const initialFormState: FormState = { fields: {}, success: false };
      const result = await updateVenueAction(editVenueId, initialFormState, formData);

      if (result.success) {
        const updatedVenue: VenueOption = {
          id: editVenueId,
          name: editVenueName.trim(),
          city: editVenueCity.trim() || null,
          state: editVenueState.trim() || null,
          timeZone: editVenueTimeZone || null,
        };
        setVenues((prev) => prev.map((v) => (v.id === editVenueId ? updatedVenue : v)));
        onVenueSelect?.(updatedVenue);
        setEditDialogOpen(false);
      } else {
        const errors = result.errors ?? {};
        const firstError =
          Object.values(errors).flat()[0] ?? 'Failed to update venue. Please try again.';
        setUpdateError(String(firstError));
      }
    } catch (err) {
      console.error('Failed to update venue:', err);
      setUpdateError('An unexpected error occurred. Please try again.');
    } finally {
      setIsUpdating(false);
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
            const venue = venues.find((v) => v.id === venueId);
            if (venue) {
              onVenueSelect?.(venue);
            }
            setOpen(false);
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
                      fetchVenueDetails(selectedId);
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
            </FormItem>
          );
        }}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setCreateError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Venue</DialogTitle>
            <DialogDescription>
              Add a new venue to the system. It will be immediately available for selection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {createError && (
              <p className="text-sm text-destructive" role="alert">
                {createError}
              </p>
            )}
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
              <label htmlFor="venue-address" className="text-sm font-medium">
                Address
              </label>
              <Input
                id="venue-address"
                value={newVenueAddress}
                onChange={(e) => setNewVenueAddress(e.target.value)}
                placeholder="Enter street address"
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="venue-postal-code" className="text-sm font-medium">
                  Postal Code
                </label>
                <Input
                  id="venue-postal-code"
                  value={newVenuePostalCode}
                  onChange={(e) => setNewVenuePostalCode(e.target.value)}
                  placeholder="Enter postal code"
                  disabled={isCreating}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="venue-country" className="text-sm font-medium">
                  Country
                </label>
                <Input
                  id="venue-country"
                  value={newVenueCountry}
                  onChange={(e) => setNewVenueCountry(e.target.value)}
                  placeholder="Enter country"
                  disabled={isCreating}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Timezone</label>
              <TimezoneSelect
                value={newVenueTimeZone || null}
                onChange={setNewVenueTimeZone}
                disabled={isCreating}
                placeholder="Select venue timezone..."
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
                  type="button"
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

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setUpdateError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Venue</DialogTitle>
            <DialogDescription>
              Update the venue details. Changes will apply to all tour dates using this venue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {updateError && (
              <p className="text-sm text-destructive" role="alert">
                {updateError}
              </p>
            )}

            {isLoadingVenue ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="edit-venue-name" className="text-sm font-medium">
                    Venue Name *
                  </label>
                  <Input
                    id="edit-venue-name"
                    value={editVenueName}
                    onChange={(e) => setEditVenueName(e.target.value)}
                    placeholder="Enter venue name"
                    disabled={isUpdating}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="edit-venue-address" className="text-sm font-medium">
                    Address
                  </label>
                  <Input
                    id="edit-venue-address"
                    value={editVenueAddress}
                    onChange={(e) => setEditVenueAddress(e.target.value)}
                    placeholder="Enter street address"
                    disabled={isUpdating}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="edit-venue-city" className="text-sm font-medium">
                    City
                  </label>
                  <Input
                    id="edit-venue-city"
                    value={editVenueCity}
                    onChange={(e) => setEditVenueCity(e.target.value)}
                    placeholder="Enter city"
                    disabled={isUpdating}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="edit-venue-state" className="text-sm font-medium">
                    State
                  </label>
                  <Input
                    id="edit-venue-state"
                    value={editVenueState}
                    onChange={(e) => setEditVenueState(e.target.value)}
                    placeholder="Enter state"
                    disabled={isUpdating}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="edit-venue-postal-code" className="text-sm font-medium">
                      Postal Code
                    </label>
                    <Input
                      id="edit-venue-postal-code"
                      value={editVenuePostalCode}
                      onChange={(e) => setEditVenuePostalCode(e.target.value)}
                      placeholder="Enter postal code"
                      disabled={isUpdating}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="edit-venue-country" className="text-sm font-medium">
                      Country
                    </label>
                    <Input
                      id="edit-venue-country"
                      value={editVenueCountry}
                      onChange={(e) => setEditVenueCountry(e.target.value)}
                      placeholder="Enter country"
                      disabled={isUpdating}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Timezone</label>
                  <TimezoneSelect
                    value={editVenueTimeZone || null}
                    onChange={setEditVenueTimeZone}
                    disabled={isUpdating}
                    placeholder="Select venue timezone..."
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleEditVenue}
              disabled={!editVenueName.trim() || isUpdating || isLoadingVenue}
            >
              {isUpdating ? 'Updating...' : 'Update Venue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
