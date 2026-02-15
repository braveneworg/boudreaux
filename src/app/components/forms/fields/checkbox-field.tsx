/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React from 'react';

import { Checkbox } from '@/app/components/ui/checkbox';
import { FormField, FormItem, FormLabel, FormControl } from '@/app/components/ui/form';

import type { Control, FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form';

interface CheckboxFieldProps<
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

export default function CheckboxField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  id,
  onUserInteraction,
  setValue,
}: CheckboxFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-start space-0">
          <FormControl>
            <Checkbox
              checked={field.value}
              onCheckedChange={(checked) => {
                onUserInteraction?.();
                const boolValue = checked === true;
                if (setValue) {
                  setValue(name, boolValue as TFieldValues[TName], {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }
                field.onChange(boolValue);
              }}
              id={id}
            />
          </FormControl>
          <FormLabel className="block text-sm font-normal" htmlFor={id}>
            {label}
          </FormLabel>
        </FormItem>
      )}
    />
  );
}
