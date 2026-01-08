'use client';

import React from 'react';

import { US_STATES } from '@/lib/utils/states';
import type { ProfileFormData } from '@/lib/validation/profile-schema';

import ComboboxField from './combobox-field';

import type { Control, UseFormSetValue } from 'react-hook-form';

interface StateFieldProps {
  control: Control<ProfileFormData>;
  onUserInteraction?: () => void;
  setValue?: UseFormSetValue<ProfileFormData>;
}

export default function StateField({ control, onUserInteraction, setValue }: StateFieldProps) {
  const stateOptions = US_STATES.map((state) => ({
    value: state.code,
    label: `${state.name} - ${state.code}`,
    searchValue: state.name.toLowerCase(),
  }));

  return (
    <ComboboxField
      control={control}
      name="state"
      label="State"
      placeholder="Select a state..."
      searchPlaceholder="Search states..."
      emptyMessage="No state found."
      options={stateOptions}
      popoverWidth="w-[300px]"
      onUserInteraction={onUserInteraction}
      setValue={setValue}
    />
  );
}
