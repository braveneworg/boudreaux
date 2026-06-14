/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { Prisma } from '@prisma/client';

/**
 * Recursive schema for an arbitrary JSON value, matching Prisma's
 * `Prisma.JsonValue` (the deserialized shape of a `Json` field such as
 * `Release.extendedData`): `string | number | boolean | null | JsonValue[] |
 * { [key: string]: JsonValue }`.
 */
export const jsonValueSchema: z.ZodType<Prisma.JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);
