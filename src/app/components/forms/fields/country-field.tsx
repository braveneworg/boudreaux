'use client';

import React from 'react';
import { Control, UseFormSetValue } from 'react-hook-form';
import ComboboxField from './combobox-field';
import { COUNTRIES } from '@/app/lib/utils/countries';
import { ProfileFormData } from '@/app/lib/validation/profile-schema';

interface CountryFieldProps {
  control: Control<ProfileFormData>;
  onUserInteraction?: () => void;
  setValue?: UseFormSetValue<ProfileFormData>;
}

export default function CountryField({ control, onUserInteraction, setValue }: CountryFieldProps) {
  const countryOptions = COUNTRIES.map((country) => ({
    value: country.code,
    label: country.name,
    searchValue: country.name.toLowerCase(),
  }));

  return (
    <ComboboxField
      control={control}
      name="country"
      label="Country"
      placeholder="Select a country..."
      searchPlaceholder="Search countries..."
      emptyMessage="No country found."
      options={countryOptions}
      popoverWidth="w-[400px]"
      onUserInteraction={onUserInteraction}
      setValue={setValue}
    />
  );
}
