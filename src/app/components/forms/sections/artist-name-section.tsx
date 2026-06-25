/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { TextField } from '@/app/components/forms/fields';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import type { Control } from 'react-hook-form';

interface ArtistNameSectionProps {
  control: Control<ArtistFormData>;
  isNameRequired: boolean;
}

export const ArtistNameSection = ({
  control,
  isNameRequired,
}: ArtistNameSectionProps): React.ReactElement => (
  <section className="space-y-4 pt-0">
    <h2 className="font-semibold">Name Information</h2>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TextField control={control} name="title" label="Title" placeholder="e.g., Dr., Prof., DJ" />
      <TextField
        control={control}
        name="firstName"
        label={`First Name${isNameRequired ? ' *' : ''}`}
        placeholder="First name"
      />
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TextField
        control={control}
        name="middleName"
        label="Middle Name"
        placeholder="Middle name"
      />
      <TextField
        control={control}
        name="surname"
        label={`Surname${isNameRequired ? ' *' : ''}`}
        placeholder="Last name"
      />
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TextField control={control} name="suffix" label="Suffix" placeholder="e.g., Jr., Sr., III" />
      <TextField
        control={control}
        name="displayName"
        label="Display Name"
        placeholder="Public display name (optional)"
      />
    </div>
    <TextField
      control={control}
      name="akaNames"
      label="AKA Names"
      placeholder="Also known as (comma-separated)"
    />
    <TextField control={control} name="slug" label="Slug *" placeholder="url-friendly-identifier" />
  </section>
);
