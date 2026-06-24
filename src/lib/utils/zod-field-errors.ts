/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The minimal shape of a Zod validation issue this helper reads. Matches
 * `ZodError['issues'][number]` structurally without depending on Zod's
 * (version-specific) exported issue type.
 */
interface ZodIssueLike {
  path: readonly PropertyKey[];
  message: string;
}

interface FieldErrorsOptions {
  /**
   * Key to bucket issues whose `path` is empty (form-level errors).
   * Defaults to `''` so dotted field keys are preserved verbatim.
   */
  formKey?: string;
  /**
   * Existing field errors to merge new issue messages into. Not mutated.
   */
  seed?: Record<string, string[]>;
}

/**
 * Collapse a list of Zod issues into a `{ field: messages[] }` record, joining
 * each issue's `path` with dots and appending its message. Multiple issues on
 * the same field accumulate in order. A `Map` keeps the dynamic field keys off
 * a plain object (object-injection-safe) until the final `Object.fromEntries`.
 *
 * @param issues - The `ZodError.issues` array from a failed `safeParse`.
 * @param options - Optional `formKey` for empty-path issues and a `seed` of
 *   pre-existing errors to merge into.
 */
export const fieldErrorsFromZodIssues = (
  issues: readonly ZodIssueLike[],
  options: FieldErrorsOptions = {}
): Record<string, string[]> => {
  const { formKey = '', seed } = options;
  const fieldErrors = new Map<string, string[]>(seed ? Object.entries(seed) : undefined);

  for (const issue of issues) {
    const key = issue.path.join('.') || formKey;
    const messages = fieldErrors.get(key) ?? [];
    messages.push(issue.message);
    fieldErrors.set(key, messages);
  }

  return Object.fromEntries(fieldErrors);
};
