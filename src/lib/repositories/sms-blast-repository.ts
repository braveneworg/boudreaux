/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type { CreateSmsBlastData, SmsBlastRecord } from '@/lib/types/domain';

import { runQuery } from './_internal/map-prisma-error';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

// Compile-time drift guard: fail `pnpm run typecheck` if the hand-written
// domain record diverges from the Prisma payload the queries actually return.
type _SmsBlastDrift = AssertExact<SmsBlastRecord, Prisma.SmsBlastGetPayload<Record<never, never>>>;
const _smsBlastDrift: _SmsBlastDrift = true;

/**
 * Data-access layer for `SmsBlast` records. The only layer that touches Prisma
 * for SMS blast history: it owns the query shapes, wraps every call in
 * `runQuery` so callers see vendor-neutral `DataError`s, and returns
 * hand-written domain types. Business logic (recipient selection, chunked
 * sending, ServiceResponse wrapping) stays in the service.
 */
export class SmsBlastRepository {
  /** Persist a completed SMS blast record. */
  static async create(data: CreateSmsBlastData): Promise<SmsBlastRecord> {
    return runQuery(() => prisma.smsBlast.create({ data }));
  }

  /**
   * Return the most-recent blast records, newest first.
   * Used by the admin announcements history view.
   */
  static async findRecent(take: number): Promise<SmsBlastRecord[]> {
    return runQuery(() =>
      prisma.smsBlast.findMany({
        orderBy: { createdAt: 'desc' },
        take,
      })
    );
  }
}
