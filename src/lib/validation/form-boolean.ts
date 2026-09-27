/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/** The strings a switch or checkbox submits through `FormData`. */
const FORM_BOOLEAN_STRINGS = ['true', 'on', 'false', 'off'] as const;

type FormBooleanString = (typeof FORM_BOOLEAN_STRINGS)[number];

const TRUE_STRINGS: ReadonlySet<FormBooleanString> = new Set(['true', 'on']);

interface FormBooleanParams {
  /** Message reported when the value is neither a boolean nor a known string. */
  message?: string;
}

/**
 * A boolean field that also accepts what a switch or checkbox submits through
 * `FormData`: `'true'`/`'on'` → `true`, `'false'`/`'off'` → `false`.
 *
 * `getActionState` no longer converts strings, so each boolean field opts in
 * here (#790). `z.coerce.boolean()` would be wrong: it reads every non-empty
 * string, `'false'` included, as `true`. Any other string is rejected rather
 * than guessed at.
 *
 * Input type is `boolean | FormBooleanString`, output is `boolean`, so the
 * same schema still serves React Hook Form, which holds real booleans.
 */
export const formBoolean = ({ message }: FormBooleanParams = {}) =>
  z.union(
    [
      z.boolean(),
      z.enum(FORM_BOOLEAN_STRINGS).transform((value): boolean => TRUE_STRINGS.has(value)),
    ],
    message ? { message } : undefined
  );
