/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';

import { useFormContext } from 'react-hook-form';

import type { FieldPath, FieldValues } from 'react-hook-form';

/**
 * Returns a callback that validates a single field on demand, used by the field
 * components to honour their `validateOnChange` prop.
 *
 * Every form in this app leaves React Hook Form on its default
 * `mode: 'onSubmit'`, so a field only reports errors once the form has been
 * submitted. Opting a field into `validateOnChange` surfaces its error while
 * the user types instead — worth it on fields whose format is easy to get
 * wrong (email, phone) and on selections that gate other fields.
 *
 * This previously rode along on an optional `setValue` prop: passing the form's
 * setter made the field write its value twice, and the second write carried
 * `shouldValidate: true`. The eager validation was a side effect of a prop that
 * named something else entirely, so whether a field validated eagerly depended
 * on whether a setter had been threaded down to it.
 *
 * Resolves the form from context rather than taking it as a prop. Reads it
 * defensively even though every field is rendered inside a `FormProvider`:
 * this hook runs at the top of the component, *before* the `FormLabel` whose
 * `useFormField` raises the canonical "should be used within a FormProvider"
 * error. Destructuring here would pre-empt that with an opaque
 * "cannot destructure property 'trigger' of null", so the legible error stays
 * owned by `form.tsx`.
 *
 * @param name - The field path to validate.
 * @param enabled - Whether the caller opted into eager validation.
 * @returns A stable no-argument callback; a no-op unless `enabled`.
 */
export const useFieldValidator = <TFieldValues extends FieldValues = FieldValues>(
  name: FieldPath<TFieldValues>,
  enabled?: boolean
): (() => void) => {
  const form = useFormContext<TFieldValues>() as ReturnType<
    typeof useFormContext<TFieldValues>
  > | null;
  const trigger = form?.trigger;

  return useCallback(() => {
    if (enabled && trigger) {
      void trigger(name);
    }
  }, [enabled, trigger, name]);
};
