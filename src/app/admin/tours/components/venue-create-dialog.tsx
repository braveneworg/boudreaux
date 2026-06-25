/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

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
import { TimezoneSelect } from '@/app/components/ui/timezone-select';

import type { UseVenueCreateDialogReturn } from './use-venue-create-dialog';
import type { VenueOption } from './venue-select';

interface VenueCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dialog: UseVenueCreateDialogReturn;
  onChange: (value: string) => void;
  onVenueSelect?: (venue: VenueOption) => void;
  onSuccess: () => void;
}

export const VenueCreateDialog = ({
  open,
  onOpenChange,
  dialog,
  onChange,
  onVenueSelect,
  onSuccess,
}: VenueCreateDialogProps) => {
  const { state, actions } = dialog;

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) actions.clearError();
  };

  const handleSubmit = () =>
    actions.handleCreate(onChange, onVenueSelect, () => {
      onOpenChange(false);
      onSuccess();
    });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Venue</DialogTitle>
          <DialogDescription>
            Add a new venue to the system. It will be immediately available for selection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {state.error && (
            <p className="text-destructive text-sm" role="alert">
              {state.error}
            </p>
          )}
          <div className="space-y-2">
            <label htmlFor="venue-name" className="text-sm font-medium">
              Venue Name *
            </label>
            <Input
              id="venue-name"
              value={state.name}
              onChange={(e) => actions.setName(e.target.value)}
              placeholder="Enter venue name"
              disabled={state.isCreating}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="venue-address" className="text-sm font-medium">
              Address
            </label>
            <Input
              id="venue-address"
              value={state.address}
              onChange={(e) => actions.setAddress(e.target.value)}
              placeholder="Enter street address"
              disabled={state.isCreating}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="venue-city" className="text-sm font-medium">
              City
            </label>
            <Input
              id="venue-city"
              value={state.city}
              onChange={(e) => actions.setCity(e.target.value)}
              placeholder="Enter city"
              disabled={state.isCreating}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="venue-state" className="text-sm font-medium">
              State
            </label>
            <Input
              id="venue-state"
              value={state.state}
              onChange={(e) => actions.setState(e.target.value)}
              placeholder="Enter state"
              disabled={state.isCreating}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="venue-postal-code" className="text-sm font-medium">
                Postal Code
              </label>
              <Input
                id="venue-postal-code"
                value={state.postalCode}
                onChange={(e) => actions.setPostalCode(e.target.value)}
                placeholder="Enter postal code"
                disabled={state.isCreating}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="venue-country" className="text-sm font-medium">
                Country
              </label>
              <Input
                id="venue-country"
                value={state.country}
                onChange={(e) => actions.setCountry(e.target.value)}
                placeholder="Enter country"
                disabled={state.isCreating}
              />
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Timezone</span>
            <TimezoneSelect
              value={state.timeZone || null}
              onChange={actions.setTimeZone}
              disabled={state.isCreating}
              placeholder="Select venue timezone..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={state.isCreating}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!state.name.trim() || state.isCreating}
          >
            {state.isCreating ? 'Creating...' : 'Create Venue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
