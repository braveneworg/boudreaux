/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/*
 * Query-plan guard. For each hot/growing query that the slow-query work
 * indexed (see prisma/schema.prisma), runs a MongoDB `explain` and asserts the
 * planner can serve it with an index scan (IXSCAN) rather than a full
 * collection scan (COLLSCAN).
 *
 * Why "considered" and not "winning": MongoDB is cost-based and will pick a
 * COLLSCAN over an IXSCAN on a tiny collection (scanning a handful of docs is
 * cheaper than an index lookup). The planner still enumerates every applicable
 * index plan and files the losers under `rejectedPlans`, so an index that is
 * APPLICABLE to a query shape appears in the plan set regardless of data size.
 * That applicability — plus the index physically existing — is what proves the
 * fix will hold at production scale, so it is what we assert here.
 *
 * E2E isolation: this connects ONLY to the local Docker MongoDB on
 * localhost:27018 (mirrors e2e/helpers/seed-test-db.ts). It never reads a DB
 * URL from .env. Run after `pnpm run e2e:docker:up` + `prisma db push` + seed.
 */
import { pathToFileURL } from 'node:url';

import { type Prisma, PrismaClient } from '@prisma/client';

/** The only DB this script will ever touch. Never sourced from .env. */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

/** A single node in a MongoDB explain plan tree. */
interface PlanStage {
  stage: string;
  indexName?: string;
  keyPattern?: Record<string, number>;
}

/** Minimal shape of the `explain` command's queryPlanner output we read. */
interface ExplainResult {
  queryPlanner?: {
    winningPlan?: unknown;
    rejectedPlans?: unknown[];
  };
}

/** A query to verify, expressed as the raw Mongo command Prisma would issue. */
interface QueryTarget {
  /** Human label for the report. */
  label: string;
  /** Collection name (Prisma model name — no `@@map` in this schema). */
  collection: string;
  /** The `find` filter, in MongoDB extended JSON. */
  filter: Record<string, unknown>;
  /** Optional sort, e.g. `{ createdAt: -1 }`. */
  sort?: Record<string, number>;
  /**
   * Acceptable leading index fields. The target passes if any considered
   * IXSCAN is keyed on one of these as its first field (so a pre-existing
   * single-field index that already serves the query counts as a pass).
   */
  acceptableLeadingFields: string[];
}

/**
 * Walk a plan tree and collect every node that has a `stage`. Recurses through
 * all object values so it is robust to classic and slot-based-execution (SBE)
 * explain shapes and to nesting under inputStage/inputStages/queryPlan/shards.
 */
export const collectStages = (node: unknown): PlanStage[] => {
  const out: PlanStage[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      n.forEach(visit);
      return;
    }
    const record = n as Record<string, unknown>;
    if (typeof record.stage === 'string') {
      out.push({
        stage: record.stage,
        indexName: typeof record.indexName === 'string' ? record.indexName : undefined,
        keyPattern:
          record.keyPattern && typeof record.keyPattern === 'object'
            ? (record.keyPattern as Record<string, number>)
            : undefined,
      });
    }
    Object.values(record).forEach(visit);
  };
  visit(node);
  return out;
};

/** The verdict for one analyzed query. */
export interface PlanVerdict {
  /** An IXSCAN keyed on an acceptable leading field is in the plan set. */
  usesAcceptableIndex: boolean;
  /** The winning plan reads via a full collection scan. */
  winningIsCollscan: boolean;
  /** The winning plan has a blocking in-memory SORT stage. */
  winningHasBlockingSort: boolean;
  /** Index names of every considered IXSCAN (winning + rejected). */
  consideredIndexes: string[];
}

/**
 * Decide whether an explain result proves the query is index-served.
 * `acceptableLeadingFields` are the index leading fields that satisfy the query
 * (e.g. an existing `releasedOn` index that already provides the sort).
 */
export const analyzePlan = (
  explain: ExplainResult,
  acceptableLeadingFields: string[]
): PlanVerdict => {
  const winningStages = collectStages(explain.queryPlanner?.winningPlan);
  const rejectedStages = (explain.queryPlanner?.rejectedPlans ?? []).flatMap(collectStages);
  const allStages = [...winningStages, ...rejectedStages];

  const leadingField = (keyPattern?: Record<string, number>): string | undefined =>
    keyPattern ? Object.keys(keyPattern)[0] : undefined;

  const ixscans = allStages.filter((s) => s.stage === 'IXSCAN');
  const usesAcceptableIndex = ixscans.some((s) =>
    acceptableLeadingFields.includes(leadingField(s.keyPattern) ?? '')
  );

  return {
    usesAcceptableIndex,
    winningIsCollscan: winningStages.some((s) => s.stage === 'COLLSCAN'),
    winningHasBlockingSort: winningStages.some((s) => s.stage === 'SORT'),
    consideredIndexes: [
      ...new Set(ixscans.map((s) => s.indexName).filter((n): n is string => Boolean(n))),
    ],
  };
};

/**
 * The queries this slow-query pass indexed. Filters/sorts mirror what the
 * repositories issue (see the repository file noted on each entry).
 */
export const TARGETS: QueryTarget[] = [
  {
    // artist-repository.ts findMany (admin listing) — sort on createdAt.
    label: 'Artist admin listing (sort createdAt desc)',
    collection: 'Artist',
    filter: {},
    sort: { createdAt: -1 },
    acceptableLeadingFields: ['createdAt'],
  },
  {
    // user-repository.ts findAdmins — equality filter on role.
    label: 'User.findAdmins (role = admin)',
    collection: 'User',
    filter: { role: 'admin' },
    acceptableLeadingFields: ['role'],
  },
  {
    // featured-artist-repository.ts findFeatured (carousel). Regression guard:
    // the publishedOn filter is `$ne null` (a range), so the sort can only be
    // served by the existing featuredOn index — this asserts that holds.
    label: 'FeaturedArtist.findFeatured (carousel)',
    collection: 'FeaturedArtist',
    filter: {
      publishedOn: { $ne: null },
      featuredOn: { $lte: { $date: '2026-06-17T00:00:00Z' } },
      $or: [
        { featuredUntil: null },
        { featuredUntil: { $exists: false } },
        { featuredUntil: { $gte: { $date: '2026-06-17T00:00:00Z' } } },
      ],
    },
    sort: { featuredOn: -1 },
    acceptableLeadingFields: ['featuredOn'],
  },
  {
    // release-repository.ts findPublished (public catalog). Regression guard:
    // served by the existing releasedOn index (publishedAt is `$ne null`, a
    // range, so it cannot provide the sort order).
    label: 'Release.findPublished (public catalog)',
    collection: 'Release',
    filter: {
      publishedAt: { $ne: null },
      $or: [{ deletedOn: null }, { deletedOn: { $exists: false } }],
    },
    sort: { releasedOn: -1 },
    acceptableLeadingFields: ['releasedOn'],
  },
  {
    // chat-rate-limit-log-repository.ts countByFingerprintSince — equality on
    // fingerprint + range on attemptedAt → compound [fingerprint, attemptedAt].
    label: 'ChatRateLimitLog.countByFingerprintSince',
    collection: 'ChatRateLimitLog',
    filter: {
      fingerprint: 'probe-fingerprint',
      attemptedAt: { $gte: { $date: '2026-06-17T00:00:00Z' } },
    },
    acceptableLeadingFields: ['fingerprint'],
  },
];

interface ListIndexesResult {
  cursor?: { firstBatch?: Array<{ name?: string; key?: Record<string, number> }> };
}

interface CountResult {
  n?: number;
}

const runChecks = async (): Promise<void> => {
  try {
    new URL(E2E_DATABASE_URL);
  } catch {
    throw new Error(
      'check-query-plans refusing to run: E2E_DATABASE_URL is not a valid URL. ' +
        'Expected mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0.'
    );
  }
  if (!E2E_DATABASE_URL.includes('localhost:27018')) {
    throw new Error(
      'check-query-plans refusing to run against a non-local database. ' +
        'It only runs against the Docker E2E MongoDB on localhost:27018.'
    );
  }

  const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
  let failures = 0;

  try {
    console.info(`\nQuery-plan check against ${E2E_DATABASE_URL}\n`);

    for (const target of TARGETS) {
      const indexes = (await prisma.$runCommandRaw({
        listIndexes: target.collection,
      })) as ListIndexesResult;
      const indexNames = (indexes.cursor?.firstBatch ?? []).map((i) => i.name ?? '');

      const countResult = (await prisma.$runCommandRaw({
        count: target.collection,
        query: {},
      })) as CountResult;
      const docCount = countResult.n ?? 0;

      const explainCommand = {
        explain: {
          find: target.collection,
          filter: target.filter,
          ...(target.sort ? { sort: target.sort } : {}),
        },
        verbosity: 'queryPlanner',
      } as Prisma.InputJsonObject;
      const explain = (await prisma.$runCommandRaw(explainCommand)) as ExplainResult;

      const verdict = analyzePlan(explain, target.acceptableLeadingFields);

      let status: 'PASS' | 'FAIL' | 'SKIP';
      let note = '';
      if (verdict.usesAcceptableIndex) {
        status = 'PASS';
        note = `index: ${verdict.consideredIndexes.join(', ') || 'n/a'}${
          verdict.winningIsCollscan
            ? ' (collscan wins at this data size; index applies at scale)'
            : ''
        }${verdict.winningHasBlockingSort ? ' [blocking SORT]' : ''}`;
      } else if (docCount === 0) {
        status = 'SKIP';
        note = 'collection empty — cannot plan; seed data to verify applicability';
      } else {
        status = 'FAIL';
        note = `no applicable index scan considered (${docCount} docs). indexes present: ${indexNames.join(', ')}`;
        failures += 1;
      }

      console.info(`  [${status}] ${target.label}`);
      if (note) console.info(`         ${note}`);
    }

    console.info('');
    if (failures > 0) {
      console.error(`${failures} quer${failures === 1 ? 'y' : 'ies'} lack an applicable index.`);
      await prisma.$disconnect();
      process.exit(1);
    }
    console.info('All queries are index-served (or skipped on empty collections).');
  } finally {
    await prisma.$disconnect();
  }
};

const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (invokedDirectly) {
  runChecks().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
