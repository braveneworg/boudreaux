/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FormState } from '@/lib/types/form-state';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

import type { ZodSafeParseResult, ZodType } from 'zod';

/**
 * How an action reads a blank string field.
 *
 * - `'omit'` (create): `''` is dropped, as if the field was not sent, so an
 *   optional field the admin left empty is simply not written.
 * - `'keep'` (update): `''` is kept, because a blank is how the admin clears an
 *   optional field. The action's builder turns it into `null`
 *   (`toClearableString`).
 *
 * The policy lives in the action, beside the builder that interprets the
 * blank. When it lived in the client's `FormData` encoding, an update hook
 * that forgot it left the featured-artist fields impossible to clear.
 */
export type BlankStrings = 'omit' | 'keep';

export interface ReadActionInputOptions {
  blankStrings: BlankStrings;
}

/** The working form state and the schema's verdict on the permitted input. */
export interface ActionInputState<TForm> {
  formState: FormState;
  parsed: ZodSafeParseResult<TForm>;
}

/**
 * Field names an action accepts. Anything else is dropped before validation,
 * so this is a deliberate policy allowlist, not a restatement of the schema:
 * release creation permits 10 of ~24 schema fields, and no action permits
 * `createdBy`, which must never be client-settable. Typed as `keyof TForm` so
 * a typo or a renamed schema field is a compile error; leaving a field out is
 * how the subset is expressed, so a new form field must be added here too.
 */
type PermittedFieldNames<TForm> = readonly (keyof TForm & string)[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSent = (value: unknown, blankStrings: BlankStrings): boolean =>
  value !== undefined && value !== null && (blankStrings === 'keep' || value !== '');

/**
 * Read a typed Server Action input: keep the permitted fields, drop unsent
 * ones (and blanks, per `blankStrings`), then validate with the same schema
 * the form uses.
 *
 * The input arrives as the object the form produced, with its types intact,
 * so nothing is decoded or coerced here: a number stays a number, an array an
 * array, and a string that merely looks numeric or JSON-shaped stays a
 * string (#790). It is still external input — the argument of a Server
 * Action can be anything — so a non-object reads as an empty one and the
 * schema decides.
 *
 * The release, artist, featured-artist and video create/update actions read
 * their input this way; only their mutation hooks call them. An action that a
 * real `<form action>` or `useActionState` posts to (profile, sign-in) still
 * receives `FormData` and reads it with `getActionState`, and so, for now, do
 * the hook-called tour, venue and banner actions.
 */
export const readActionInput = <TForm>(
  input: unknown,
  permittedFieldNames: PermittedFieldNames<TForm>,
  formSchema: ZodType<TForm>,
  { blankStrings }: ReadActionInputOptions
): ActionInputState<TForm> => {
  const permitted = new Set<string>(permittedFieldNames);
  const entries = isRecord(input) ? Object.entries(input) : [];
  const sent = entries.filter(([key, value]) => permitted.has(key) && isSent(value, blankStrings));

  // `fields` echoes submitted strings back to a `useActionState` form; these
  // actions are called from mutation hooks, which never read it.
  const formState: FormState = { errors: {}, fields: {}, success: false, hasTimeout: false };

  return { formState, parsed: formSchema.safeParse(Object.fromEntries(sent)) };
};

/**
 * The ObjectId a create form pre-generated for the new row (so uploads can be
 * keyed to it before the row exists), or `undefined` when it is missing or
 * not a valid ObjectId. Read apart from the permitted fields because it is not
 * a form field and an invalid one is ignored rather than reported.
 */
export const readPreGeneratedId = (input: unknown): string | undefined => {
  const value = isRecord(input) ? input.preGeneratedId : undefined;
  return typeof value === 'string' && isValidObjectId(value) ? value : undefined;
};
