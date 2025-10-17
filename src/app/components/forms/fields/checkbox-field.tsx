'use client';

import React from 'react';
import { Control, FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl } from '@/app/components/ui/form';
import { Checkbox } from '@/app/components/ui/checkbox';

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
