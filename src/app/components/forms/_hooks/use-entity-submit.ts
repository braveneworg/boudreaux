/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';

import { toast } from 'sonner';

import type { FormState } from '@/lib/types/form-state';
import { error } from '@/lib/utils/console-logger';
import { setFormErrors } from '@/lib/utils/forms/set-form-errors';

import type { FieldValues, UseFormReturn } from 'react-hook-form';

/** Whether a submit created a new entity or updated an existing one. */
export type SubmitMode = 'create' | 'update';

/** What the protocol needs of a write's result: whether it landed, and the server's errors. */
type EntitySubmitResult = Pick<FormState, 'success' | 'errors'>;

interface UseEntitySubmitOptions<TValues extends FieldValues, TResult extends EntitySubmitResult> {
  /** Lower-case singular noun used in the failure copy, e.g. `'artist'`. */
  entity: string;
  /**
   * The form being submitted: reset to the submitted values once the write has
   * succeeded, and marked with the server's field errors when it fails.
   */
  form: Pick<UseFormReturn<TValues>, 'reset' | 'setError'>;
  create: (values: TValues) => Promise<TResult>;
  update: (id: string, values: TValues) => Promise<TResult>;
  /**
   * Everything specific to this entity once the write has succeeded — capturing
   * a created id, flipping a published flag, uploading pending images, routing.
   * Runs before the form is reset.
   */
  onSuccess?: (result: TResult, values: TValues, mode: SubmitMode) => void | Promise<void>;
  /**
   * Handle a failed write in place of the default — for a form whose failure
   * needs more than marked fields and a toast. The form is not reset.
   */
  onFailure?: (result: TResult, values: TValues, mode: SubmitMode) => void;
}

/**
 * The submit protocol shared by every entity form: guard the form ref, dispatch
 * create-or-update on the presence of an id, stop on failure, then hand off to
 * the entity's own success handling and reset the form.
 *
 * A failure marks each field the server's errors name (through
 * {@link setFormErrors}) and toasts the server's `general` error, or a message
 * naming the entity and the verb when there is none. `onFailure` replaces that.
 *
 * Deliberately owns only what every form does identically. Entity-specific
 * work stays in `onSuccess` rather than being threaded in as a bag of
 * dependencies — the pattern this replaces grew to nine such dependencies on
 * the release form, which is how the "shared" helpers ended up re-implemented
 * per entity anyway.
 *
 * Not used by `profile-form`, which stays on `useActionState` for progressive
 * enhancement (see ADR-0003).
 */
export const useEntitySubmit = <TValues extends FieldValues, TResult extends EntitySubmitResult>({
  entity,
  form,
  create,
  update,
  onSuccess,
  onFailure,
}: UseEntitySubmitOptions<TValues, TResult>) => {
  const { reset, setError } = form;
  return useCallback(
    async (formEl: HTMLFormElement | null, id: string | null, values: TValues): Promise<void> => {
      if (!formEl) {
        error(`${entity} form: form reference is null on submit.`);
        toast.error('Please refresh the page and try again, or check back later.');
        return;
      }

      const mode: SubmitMode = id ? 'update' : 'create';
      const result = id ? await update(id, values) : await create(values);

      if (!result.success) {
        if (onFailure) {
          onFailure(result, values, mode);
          return;
        }
        const { generalError } = setFormErrors(setError, result);
        toast.error(
          generalError ?? `Failed to ${mode} ${entity}. Please check the form for errors.`
        );
        return;
      }

      await onSuccess?.(result, values, mode);
      reset(values);
    },
    [entity, reset, setError, create, update, onSuccess, onFailure]
  );
};
