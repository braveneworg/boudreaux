/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React from 'react';

import { FormField, FormItem, FormLabel, FormControl } from '@/app/components/ui/form';
import { Switch } from '@/app/components/ui/switch';

import type { Control, FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form';

interface SwitchFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  label: React.ReactNode;
  id: string;
  onUserInteraction?: () => void;
  setValue?: UseFormSetValue<TFieldValues>;
}

/**
 * Boolean form control rendered as an accessible toggle switch (the project's
 * mobile-first replacement for checkboxes). Integrates with React Hook Form via
 * `FormField`, optionally mirroring the value through `setValue` and notifying a
 * dirty-tracking callback. The whole row is a generous tap target for touch.
 */
export const SwitchField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  id,
  onUserInteraction,
  setValue,
}: SwitchFieldProps<TFieldValues, TName>) => (
  <FormField
    control={control}
    name={name}
    render={({ field }) => (
      <FormItem className="flex flex-row items-center gap-3 space-y-0">
        <FormControl>
          <Switch
            checked={!!field.value}
            onCheckedChange={(checked) => {
              onUserInteraction?.();
              if (setValue) {
                setValue(name, checked as TFieldValues[TName], {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }
              field.onChange(checked);
            }}
            id={id}
          />
        </FormControl>
        <FormLabel className="cursor-pointer text-sm font-normal" htmlFor={id}>
          {label}
        </FormLabel>
      </FormItem>
    )}
  />
);
