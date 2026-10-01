/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isPresent } from './where-kit';

import type { Prisma } from '@prisma/client';

/**
 * User `where` fragments. A phone number counts as reachable only when it is
 * stored, non-null and non-empty; `{ not: null }` alone already excludes an
 * absent field on Mongo, so no `isSet` guard sits beside it. Proved by
 * `user-where.contract.spec.ts`.
 */
export const userWhere = {
  /** Has a phone number: present and not the empty string. */
  hasPhone: { AND: [isPresent('phone'), { phone: { not: '' } }] },
  /** Opted in to SMS and reachable by phone. */
  smsReachable: {
    allowSmsNotifications: true,
    AND: [isPresent('phone'), { phone: { not: '' } }],
  },
} as const satisfies Record<string, Prisma.UserWhereInput>;
