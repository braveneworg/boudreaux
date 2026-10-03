#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Stamp `ArtistRelease.position` on credits written before the field
 * existed. Those rows read as position 0 and fall back to `id` order — the
 * order they were inserted in — so this script ranks each release's credits
 * in that same `creditOrderBy` order and writes the rank where it differs
 * from the stored position. Idempotent: a release whose positions are
 * already dense plans no update, and a release an admin has since reordered
 * keeps that order.
 *
 * Usage (DATABASE_URL scoped to the command; see AGENTS.md hard constraint 1):
 *
 *   DATABASE_URL='<url>' pnpm run backfill:credit-positions            # dry run
 *   DATABASE_URL='<url>' pnpm run backfill:credit-positions -- --execute
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

import { creditOrderBy } from '../src/lib/repositories/_internal/credit-order';

dotenv.config({ path: '.env.local' });
dotenv.config();

const TAG = '[backfill-credit-positions]';

export interface CreditRow {
  id: string;
  releaseId: string;
  position: number;
}

export interface PositionUpdate {
  id: string;
  position: number;
}

export interface BackfillDeps {
  prisma?: PrismaClient;
  log?: (line: string) => void;
}

/**
 * Rank each release's credits in the order they arrive (which must be
 * `creditOrderBy` order) and return the rows whose stored position differs
 * from their rank.
 */
export const planPositions = (rows: CreditRow[]): PositionUpdate[] => {
  const nextRank = new Map<string, number>();
  const updates: PositionUpdate[] = [];
  for (const { id, releaseId, position } of rows) {
    const rank = nextRank.get(releaseId) ?? 0;
    nextRank.set(releaseId, rank + 1);
    if (rank !== position) {
      updates.push({ id, position: rank });
    }
  }
  return updates;
};

const loadCredits = (prisma: PrismaClient): Promise<CreditRow[]> =>
  prisma.artistRelease.findMany({
    select: { id: true, releaseId: true, position: true },
    orderBy: creditOrderBy,
  });

/** Orchestrates the dry-run / execute flow, owning the client unless one is injected. */
export const backfillCreditPositions = async (
  argv: string[],
  deps: BackfillDeps = {}
): Promise<void> => {
  if (!process.env.DATABASE_URL) {
    throw new Error(`${TAG} DATABASE_URL env var is required`);
  }
  const prisma = deps.prisma ?? new PrismaClient();
  const log = deps.log ?? ((line: string): void => console.info(line));

  try {
    const rows = await loadCredits(prisma);
    const updates = planPositions(rows);
    log(`${TAG} ${updates.length} credit(s) of ${rows.length} need a position.`);
    if (updates.length === 0) {
      return;
    }
    if (!argv.includes('--execute')) {
      log(`${TAG} Dry run. Re-run with --execute to stamp them.`);
      return;
    }
    await prisma.$transaction(
      updates.map(({ id, position }) =>
        prisma.artistRelease.update({ where: { id }, data: { position } })
      )
    );
    log(`${TAG} Stamped ${updates.length} credit(s).`);
  } finally {
    if (!deps.prisma) {
      await prisma.$disconnect();
    }
  }
};

/* istanbul ignore next -- top-level CLI entry */
if (
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('backfill-credit-positions.ts')
) {
  backfillCreditPositions(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
