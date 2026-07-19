/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import type { VenueCreateInput } from '@/lib/validation/tours/venue-schema';

import { useCreateVenueMutation } from '../_hooks/mutations/use-venue-mutations';

import type { VenueOption } from './venue-select';

export interface VenueCreateDialogState {
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  timeZone: string;
  isCreating: boolean;
  error: string | null;
}

export interface VenueCreateDialogActions {
  setName: (v: string) => void;
  setAddress: (v: string) => void;
  setCity: (v: string) => void;
  setState: (v: string) => void;
  setPostalCode: (v: string) => void;
  setCountry: (v: string) => void;
  setTimeZone: (v: string) => void;
  clearError: () => void;
  reset: () => void;
  handleCreate: (
    onChange: (value: string) => void,
    onVenueSelect?: (venue: VenueOption) => void,
    onSuccess?: () => void
  ) => Promise<void>;
}

export interface UseVenueCreateDialogReturn {
  state: VenueCreateDialogState;
  actions: VenueCreateDialogActions;
}

const toNullableString = (v: string): string | null => v.trim() || null;

interface NewVenueParams {
  id: string;
  name: string;
  city: string;
  state: string;
  timeZone: string;
}

const buildNewVenue = ({ id, name, city, state, timeZone }: NewVenueParams): VenueOption => ({
  id,
  name: name.trim(),
  city: toNullableString(city),
  state: toNullableString(state),
  timeZone: toNullableString(timeZone),
});

const extractFirstError = (errors: Record<string, unknown>): string =>
  String(Object.values(errors).flat()[0] ?? 'Failed to create venue. Please try again.');

export const useVenueCreateDialog = (): UseVenueCreateDialogReturn => {
  const { createVenueAsync } = useCreateVenueMutation();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setAddress('');
    setCity('');
    setState('');
    setPostalCode('');
    setCountry('');
    setTimeZone('');
  };

  const clearError = () => setError(null);

  const handleCreate = async (
    onChange: (value: string) => void,
    onVenueSelect?: (venue: VenueOption) => void,
    onSuccess?: () => void
  ) => {
    if (!name.trim()) return;

    setIsCreating(true);
    setError(null);
    try {
      const values: VenueCreateInput = {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        postalCode: postalCode.trim(),
        country: country.trim(),
        timeZone,
      };
      const result = await createVenueAsync(values);
      if (result.success && result.data?.venueId) {
        const venueId = String(result.data.venueId);
        const newVenue = buildNewVenue({ id: venueId, name, city, state, timeZone });
        onChange(newVenue.id);
        onVenueSelect?.(newVenue);
        reset();
        onSuccess?.();
      } else {
        setError(extractFirstError(result.errors ?? {}));
      }
    } catch (err) {
      console.error('Failed to create venue:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return {
    state: { name, address, city, state, postalCode, country, timeZone, isCreating, error },
    actions: {
      setName,
      setAddress,
      setCity,
      setState,
      setPostalCode,
      setCountry,
      setTimeZone,
      clearError,
      reset,
      handleCreate,
    },
  };
};
