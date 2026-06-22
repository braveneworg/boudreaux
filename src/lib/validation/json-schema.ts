/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { Json } from '@/lib/types/domain/shared';

/**
 * Recursive schema for an arbitrary JSON value, matching the vendor-neutral
 * domain `Json` type (the deserialized shape of a `Json` field such as
 * `Release.extendedData`): `string | number | boolean | null | Json[] |
 * { [key: string]: Json }`.
 */
export const jsonValueSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);
