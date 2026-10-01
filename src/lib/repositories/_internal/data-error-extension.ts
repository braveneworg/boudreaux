/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import { runQuery } from './map-prisma-error';

/**
 * Client extension that makes `DataError` translation a property of the Prisma
 * seam rather than of each repository method (ADR-0001).
 *
 * Every operation on every model passes through `runQuery`, so a Prisma or
 * driver failure surfaces above the repository layer only as a `DataError`
 * carrying a `DataErrorCode`. A `DataError` thrown inside the query (a
 * repository raising `NOT_FOUND` itself) is passed through unchanged.
 */
export const createDataErrorExtension = () =>
  Prisma.defineExtension({
    name: 'data-error-translation',
    query: {
      $allOperations: ({ args, query }) => runQuery(() => query(args)),
    },
  });
