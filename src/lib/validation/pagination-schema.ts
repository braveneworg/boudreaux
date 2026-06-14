/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { PaginatedResponse } from '@/lib/types/pagination';

/**
 * Builds a schema for one page of a skip/offset–paginated list endpoint,
 * wrapping a row schema in the standard `{ rows, nextSkip }` envelope.
 *
 * @typeParam T - The validated row type produced by `row`.
 * @param row - Zod schema describing a single row in the page.
 * @returns A schema validating a {@link PaginatedResponse} of that row type.
 */
export function paginatedResponseSchema<T>(row: z.ZodType<T>): z.ZodType<PaginatedResponse<T>> {
  return z.object({
    rows: z.array(row),
    nextSkip: z.number().nullable(),
  });
}
