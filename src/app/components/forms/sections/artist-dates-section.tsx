/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';
import { DatePicker } from '@/ui/datepicker';

import type { Control, FieldPath } from 'react-hook-form';

type DateFieldName = Extract<FieldPath<ArtistFormData>, 'bornOn' | 'diedOn' | 'formedOn'>;

interface ArtistDateFieldProps {
  control: Control<ArtistFormData>;
  name: DateFieldName;
  label: string;
  onSelectDate: (dateString: string, fieldName: string) => void;
}

const ArtistDateField = ({
  control,
  name,
  label,
  onSelectDate,
}: ArtistDateFieldProps): React.ReactElement => (
  <FormField
    control={control}
    name={name}
    render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl>
          <DatePicker fieldName={field.name} onSelect={onSelectDate} {...field} />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
);

interface ArtistDatesSectionProps {
  control: Control<ArtistFormData>;
  onSelectDate: (dateString: string, fieldName: string) => void;
}

/**
 * Birth, death and formation dates. Genres and tags used to share this
 * section; they moved up beside the slug in `ArtistDetailsSection` (ADR-0009),
 * next to the bio panel that generates them.
 */
export const ArtistDatesSection = ({
  control,
  onSelectDate,
}: ArtistDatesSectionProps): React.ReactElement => (
  <section className="space-y-4">
    <h2 className="font-semibold">Important Dates</h2>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <ArtistDateField
        control={control}
        name="bornOn"
        label="Born on"
        onSelectDate={onSelectDate}
      />
      <ArtistDateField
        control={control}
        name="diedOn"
        label="Died on"
        onSelectDate={onSelectDate}
      />
    </div>
    <ArtistDateField
      control={control}
      name="formedOn"
      label="Formed on"
      onSelectDate={onSelectDate}
    />
    <p className="text-xs text-zinc-950">Only used for bands</p>
  </section>
);
