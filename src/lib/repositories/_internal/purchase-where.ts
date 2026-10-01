/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isPresent, isUnset } from './where-kit';

import type { Prisma } from '@prisma/client';

/**
 * Release-purchase `where` fragments. A refund stamps `refundedAt`; a purchase
 * that was never refunded usually has no `refundedAt` field at all (Prisma
 * omits optional fields on create, and rows predate the field), so a bare
 * `{ refundedAt: null }` misses it. A refunded purchase entitles nothing
 * (ADR-0018). Proved by `purchase-where.contract.spec.ts`.
 */
export const purchaseWhere = {
  /** Active: not refunded — `refundedAt` null or absent. */
  active: isUnset('refundedAt'),
  /** Refunded: `refundedAt` holds a date. */
  refunded: isPresent('refundedAt'),
} as const satisfies Record<string, Prisma.ReleasePurchaseWhereInput>;
