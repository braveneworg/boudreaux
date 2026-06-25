/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FormState } from '@/lib/types/form-state';

/**
 * Structural shape of a Zod error's issue list — decoupled from Zod's exported
 * types so the helper can be unit-tested with plain objects while still
 * accepting a real `ZodError` (which is structurally compatible).
 */
interface ZodIssueLike {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}

interface ZodErrorLike {
  issues: ReadonlyArray<ZodIssueLike>;
}

/**
 * Merge Zod validation issues into a FormState's field-level `errors`, keyed by
 * the first path segment (issues with an empty path land under `general`).
 * Existing errors are preserved and appended to, never replaced. Mutates and
 * returns the given `formState`.
 */
export const applyZodIssuesToFormState = (formState: FormState, error: ZodErrorLike): FormState => {
  const errors = new Map<string, string[]>(Object.entries(formState.errors ?? {}));
  for (const issue of error.issues) {
    const field = issue.path[0]?.toString() || 'general';
    const messages = errors.get(field) ?? [];
    messages.push(issue.message);
    errors.set(field, messages);
  }
  formState.errors = Object.fromEntries(errors);
  return formState;
};
