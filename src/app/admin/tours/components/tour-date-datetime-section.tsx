/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { VenueSelect } from '@/app/admin/tours/components/venue-select';
import { DatePicker } from '@/app/components/ui/datepicker';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import { TimePicker } from '@/app/components/ui/timepicker';
import { TimezoneSelect } from '@/app/components/ui/timezone-select';

import type { Control, FieldValues, UseFormGetValues, UseFormSetValue } from 'react-hook-form';

export interface TourDateDatetimeSectionProps {
  control: Control;
  isSaving: boolean;
  getValues: UseFormGetValues<FieldValues>;
  setValue: UseFormSetValue<FieldValues>;
  onVenueSelect: (venue: { timeZone?: string | null }) => void;
}

const extractTimeOnly = (raw: string): string =>
  raw.includes('T') ? (raw.split('T')[1]?.slice(0, 5) ?? '') : '';

const buildDatePrefix = (startDate: string): string =>
  startDate ? String(startDate).slice(0, 10) : new Date().toISOString().slice(0, 10);

export const TourDateDatetimeSection = ({
  control,
  isSaving,
  getValues,
  setValue,
  onVenueSelect,
}: TourDateDatetimeSectionProps) => (
  <section className="space-y-4">
    <h4 className="text-sm font-semibold">Dates and Times</h4>

    <VenueSelect
      control={control}
      name="venueId"
      label="Venue"
      placeholder="Select a venue"
      description="Choose an existing venue or create a new one"
      onVenueSelect={onVenueSelect}
    />

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField
        control={control}
        name="startDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Start Date *</FormLabel>
            <FormControl>
              <DatePicker
                fieldName="startDate"
                value={String(field.value || '')}
                onSelect={(dateString) => {
                  if (!dateString) {
                    field.onChange('');
                    return;
                  }
                  const dateStr = new Date(dateString).toISOString().split('T')[0];
                  field.onChange(dateStr);
                  // Auto-populate showStartTime to 8 PM if the user has
                  // not yet chosen a time — prevents a required-field
                  // validation error for users who skip the TimePicker.
                  if (!getValues('showStartTime')) {
                    setValue('showStartTime', `${dateStr}T20:00`);
                  }
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="endDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>End Date</FormLabel>
            <FormControl>
              <DatePicker
                fieldName="endDate"
                value={String(field.value || '')}
                onSelect={(dateString) => {
                  if (!dateString) {
                    field.onChange('');
                    return;
                  }
                  field.onChange(new Date(dateString).toISOString().split('T')[0]);
                }}
              />
            </FormControl>
            <FormDescription>Leave blank if single-day event</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Timezone */}
      <FormField
        control={control}
        name={'timeZone' as never}
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Timezone</FormLabel>
            <FormControl>
              <TimezoneSelect
                value={(field.value as string) || null}
                onChange={field.onChange}
                disabled={isSaving}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* UTC Offset */}
      <FormField
        control={control}
        name={'utcOffset' as never}
        render={({ field }) => (
          <FormItem>
            <FormLabel>UTC Offset (minutes)</FormLabel>
            <FormControl>
              <input
                {...field}
                value={(field.value as string) || ''}
                type="number"
                placeholder="e.g. -300"
                className="border-input focus-visible:ring-ring flex h-9 w-full border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-zinc-800 focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </FormControl>
            <p className="text-xs text-zinc-950">
              Minutes from UTC. Auto-filled when a timezone is selected.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField
        control={control}
        name="showStartTime"
        render={({ field }) => {
          const timeOnly = extractTimeOnly(String(field.value || ''));
          return (
            <FormItem>
              <FormLabel>Show Start Time *</FormLabel>
              <FormControl>
                <TimePicker
                  value={timeOnly}
                  placeholder="Select start time"
                  onSelect={(time) => {
                    if (!time) {
                      field.onChange('');
                      return;
                    }
                    // Combine with startDate if available, else today
                    field.onChange(`${buildDatePrefix(getValues('startDate'))}T${time}`);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <FormField
        control={control}
        name="showEndTime"
        render={({ field }) => {
          const timeOnly = extractTimeOnly(String(field.value || ''));
          return (
            <FormItem>
              <FormLabel>Show End Time</FormLabel>
              <FormControl>
                <TimePicker
                  value={timeOnly}
                  placeholder="Select end time"
                  onSelect={(time) => {
                    if (!time) {
                      field.onChange('');
                      return;
                    }
                    field.onChange(`${buildDatePrefix(getValues('startDate'))}T${time}`);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />
    </div>

    <FormField
      control={control}
      name="doorsOpenAt"
      render={({ field }) => {
        const timeOnly = extractTimeOnly(String(field.value || ''));
        return (
          <FormItem>
            <FormLabel>Doors Open At</FormLabel>
            <FormControl>
              <TimePicker
                value={timeOnly}
                placeholder="Select doors open time"
                onSelect={(time) => {
                  if (!time) {
                    field.onChange('');
                    return;
                  }
                  field.onChange(`${buildDatePrefix(getValues('startDate'))}T${time}`);
                }}
              />
            </FormControl>
            <FormDescription>
              Time when doors open for entry (before the show starts)
            </FormDescription>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  </section>
);
