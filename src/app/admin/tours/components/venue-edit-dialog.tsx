/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import { TimezoneSelect } from '@/app/components/ui/timezone-select';
import type { VenueUpdateInput } from '@/lib/validation/tours/venue-schema';

import { useUpdateVenueMutation } from '../_hooks/mutations/use-venue-mutations';
import { useVenueDetailQuery } from '../_hooks/use-venue-detail-query';

import type { VenueOption } from './venue-select';

interface VenueEditDialogProps {
  open: boolean;
  venueId: string;
  onOpenChange: (open: boolean) => void;
  onVenueSelect?: (venue: VenueOption) => void;
}

interface EditFormState {
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  timeZone: string;
}

const buildUpdateValues = (form: EditFormState): VenueUpdateInput => ({
  name: form.name.trim(),
  city: form.city.trim(),
  ...(form.address.trim() ? { address: form.address.trim() } : {}),
  ...(form.state.trim() ? { state: form.state.trim() } : {}),
  ...(form.postalCode.trim() ? { postalCode: form.postalCode.trim() } : {}),
  ...(form.country.trim() ? { country: form.country.trim() } : {}),
  ...(form.timeZone ? { timeZone: form.timeZone } : {}),
});

const extractFirstError = (errors: Record<string, unknown>): string =>
  String(Object.values(errors).flat()[0] ?? 'Failed to update venue. Please try again.');

export const VenueEditDialog = ({
  open,
  venueId,
  onOpenChange,
  onVenueSelect,
}: VenueEditDialogProps) => {
  const { updateVenueAsync } = useUpdateVenueMutation();
  const { isPending: isLoadingVenue, data: venueDetail } = useVenueDetailQuery(venueId);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (venueDetail) {
      setName(venueDetail.name || '');
      setAddress(venueDetail.address || '');
      setCity(venueDetail.city || '');
      setState(venueDetail.state || '');
      setPostalCode(venueDetail.postalCode || '');
      setCountry(venueDetail.country || '');
      setTimeZone(venueDetail.timeZone || '');
    }
  }, [venueDetail]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) setError(null);
  };

  const handleUpdate = async () => {
    if (!name.trim()) return;

    setIsUpdating(true);
    setError(null);
    try {
      const values = buildUpdateValues({
        name,
        address,
        city,
        state,
        postalCode,
        country,
        timeZone,
      });
      const result = await updateVenueAsync({ id: venueId, values });

      if (result.success) {
        onVenueSelect?.({
          id: venueId,
          name: name.trim(),
          city: city.trim() || null,
          state: state.trim() || null,
          timeZone: timeZone || null,
        });
        onOpenChange(false);
      } else {
        setError(extractFirstError(result.errors ?? {}));
      }
    } catch (err) {
      console.error('Failed to update venue:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Venue</DialogTitle>
          <DialogDescription>
            Update the venue details. Changes will apply to all tour dates using this venue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
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
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
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
                  value={state}
                  onChange={(e) => setState(e.target.value)}
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
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
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
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Enter country"
                    disabled={isUpdating}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium">Timezone</span>
                <TimezoneSelect
                  value={timeZone || null}
                  onChange={setTimeZone}
                  disabled={isUpdating}
                  placeholder="Select venue timezone..."
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleUpdate}
            disabled={!name.trim() || isUpdating || isLoadingVenue}
          >
            {isUpdating ? 'Updating...' : 'Update Venue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
