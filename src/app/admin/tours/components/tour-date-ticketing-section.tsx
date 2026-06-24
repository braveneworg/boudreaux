/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { TextField } from '@/app/components/forms/fields';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';

import type { Control } from 'react-hook-form';

export interface TourDateTicketingSectionProps {
  control: Control;
}

export const TourDateTicketingSection = ({ control }: TourDateTicketingSectionProps) => (
  <section className="space-y-4">
    <h4 className="text-sm font-semibold">Ticketing</h4>

    <TextField
      control={control}
      name="ticketsUrl"
      label="Tickets URL"
      placeholder="https://example.com/tickets"
      type="text"
    />

    <TextField
      control={control}
      name="ticketPrices"
      label="Ticket Price"
      placeholder="$25 - $100"
    />

    <FormField
      control={control}
      name="ticketIconUrl"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Ticket Icon URL</FormLabel>
          <FormControl>
            <input
              {...field}
              value={field.value || ''}
              type="text"
              placeholder="https://cdn.example.com/icons/provider-icon.png"
              className="border-input focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-800 focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </FormControl>
          <FormDescription>
            Optional. Upload a custom icon to S3 and paste the URL here. If left blank, the icon is
            auto-detected from the ticket URL domain (Bandsintown, Eventbrite, StubHub,
            Ticketmaster).
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  </section>
);
