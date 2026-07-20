/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';

import { toast } from 'sonner';

import { error } from '@/lib/utils/console-logger';

/** Whether a submit created a new entity or updated an existing one. */
export type SubmitMode = 'create' | 'update';

interface UseEntitySubmitOptions<TValues, TResult extends { success: boolean }> {
  /** Lower-case singular noun used in the failure copy, e.g. `'artist'`. */
  entity: string;
  /** Reset the form to the submitted values once the write has succeeded. */
  reset: (values: TValues) => void;
  create: (values: TValues) => Promise<TResult>;
  update: (id: string, values: TValues) => Promise<TResult>;
  /**
   * Everything specific to this entity once the write has succeeded — capturing
   * a created id, flipping a published flag, uploading pending images, routing.
   * Runs before the form is reset.
   */
  onSuccess?: (result: TResult, values: TValues, mode: SubmitMode) => void | Promise<void>;
}

/**
 * The submit protocol shared by every entity form: guard the form ref, dispatch
 * create-or-update on the presence of an id, stop on failure with a message
 * naming the entity, then hand off to the entity's own success handling and
 * reset the form.
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
export const useEntitySubmit = <TValues, TResult extends { success: boolean }>({
  entity,
  reset,
  create,
  update,
  onSuccess,
}: UseEntitySubmitOptions<TValues, TResult>) =>
  useCallback(
    async (formEl: HTMLFormElement | null, id: string | null, values: TValues): Promise<void> => {
      if (!formEl) {
        error(`${entity} form: form reference is null on submit.`);
        toast.error('Please refresh the page and try again, or check back later.');
        return;
      }

      const mode: SubmitMode = id ? 'update' : 'create';
      const result = id ? await update(id, values) : await create(values);

      if (!result.success) {
        toast.error(`Failed to ${mode} ${entity}. Please check the form for errors.`);
        return;
      }

      await onSuccess?.(result, values, mode);
      reset(values);
    },
    [entity, reset, create, update, onSuccess]
  );
