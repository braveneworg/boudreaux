/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useEffect } from 'react';

import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';

import type { Control, FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form';

interface TextFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  className?: string;
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  labelClassName?: string;
  placeholder: string;
  type?: 'text' | 'email' | 'tel';
  onUserInteraction?: () => void;
  value?: string;
  setValue?: UseFormSetValue<TFieldValues>;
  disabled?: boolean;
}

export default function TextField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  className,
  control,
  name,
  label,
  labelClassName,
  placeholder,
  type = 'text',
  onUserInteraction,
  setValue,
  value = '',
  disabled = false,
}: TextFieldProps<TFieldValues, TName>) {
  useEffect(() => {
    if (setValue && value) {
      setValue(name, value as TFieldValues[TName], {
        shouldDirty: true,
        shouldValidate: false,
      });
    }
  }, [value, name, setValue]);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel className={labelClassName}>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              placeholder={placeholder}
              type={type}
              disabled={disabled}
              onChange={(e) => {
                onUserInteraction?.();
                if (setValue) {
                  setValue(name, e.target.value as TFieldValues[TName], {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }
                field.onChange(e);
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
