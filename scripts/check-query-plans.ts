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
  /**
   * Optional stronger assertion: the SPECIFIC covering index must be
   * considered, identified by the leading key fields its keyPattern must begin
   * with (in order). Unlike `acceptableLeadingFields` (any index sharing the
   * leading field passes), this proves the exact compound index is applicable —
   * needed where a pre-existing single-field index shares the leading field but
   * does not cover the sort or an extra range/equality predicate.
   */
  requiredKeyPrefix?: string[];
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
  /** keyPattern of every considered IXSCAN (winning + rejected). */
  consideredKeyPatterns: Record<string, number>[];
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
    consideredKeyPatterns: ixscans
      .map((s) => s.keyPattern)
      .filter((kp): kp is Record<string, number> => Boolean(kp)),
  };
};

/**
 * True when at least one considered index's keyPattern begins with exactly the
 * given field sequence, in order. Proves the SPECIFIC covering index — not just
 * something that shares the leading field — is applicable to the query shape.
 */
export const matchesKeyPrefix = (
  keyPatterns: Record<string, number>[],
  requiredPrefix: string[]
): boolean =>
  keyPatterns.some((keyPattern) => {
    const keys = Object.keys(keyPattern);
    return requiredPrefix.every((field, index) => keys.at(index) === field);
  });

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

  // --- slow-query hardening pass (2026-07-14) ---
  // Each entry uses `requiredKeyPrefix` to assert the SPECIFIC new compound
  // index is considered, not merely a pre-existing index sharing the leading
  // field. RED before the index is added; GREEN after `prisma db push`.
  {
    // download-event-repository.ts countSuccessfulDownloadsInWindow (auth path).
    label: 'DownloadEvent.countSuccessfulDownloadsInWindow (user)',
    collection: 'DownloadEvent',
    filter: {
      userId: 'probe-user',
      releaseId: 'probe-release',
      success: true,
      downloadedAt: { $gte: { $date: '2026-06-17T00:00:00Z' } },
    },
    acceptableLeadingFields: ['userId'],
    requiredKeyPrefix: ['userId', 'releaseId', 'downloadedAt'],
  },
  {
    // download-event-repository.ts getTotalDownloads / getAnalyticsByRelease.
    label: 'DownloadEvent.getTotalDownloads (releaseId + success)',
    collection: 'DownloadEvent',
    filter: { releaseId: 'probe-release', success: true },
    acceptableLeadingFields: ['releaseId'],
    requiredKeyPrefix: ['releaseId', 'success'],
  },
  {
    // download-event-repository.ts getAnalyticsByUser.
    label: 'DownloadEvent.getAnalyticsByUser (userId + success)',
    collection: 'DownloadEvent',
    filter: { userId: 'probe-user', success: true },
    acceptableLeadingFields: ['userId'],
    requiredKeyPrefix: ['userId', 'success'],
  },
  {
    // release-digital-format-repository.ts findAllByRelease (soft-delete filter).
    label: 'ReleaseDigitalFormat.findAllByRelease (releaseId + deletedAt)',
    collection: 'ReleaseDigitalFormat',
    filter: {
      releaseId: 'probe-release',
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    },
    acceptableLeadingFields: ['releaseId'],
    requiredKeyPrefix: ['releaseId', 'deletedAt'],
  },
  {
    // image-repository.ts findManyByArtist — artistId filter, sortOrder sort.
    label: 'Image.findManyByArtist (artistId + sortOrder)',
    collection: 'Image',
    filter: { artistId: 'probe-artist' },
    sort: { sortOrder: 1 },
    acceptableLeadingFields: ['artistId'],
    requiredKeyPrefix: ['artistId', 'sortOrder'],
  },
  {
    // artist-repository.ts listPublishedWithBio — isActive eq + displayName sort
    // (publishedOn `$ne null` is a range, filtered inline).
    label: 'Artist.listPublishedWithBio (isActive + displayName)',
    collection: 'Artist',
    filter: { isActive: true, publishedOn: { $ne: null } },
    sort: { displayName: 1 },
    acceptableLeadingFields: ['isActive', 'displayName'],
    requiredKeyPrefix: ['isActive', 'displayName'],
  },
  {
    // featured-artist-repository.ts findAll — [position asc, featuredOn desc].
    label: 'FeaturedArtist.findAll (position + featuredOn)',
    collection: 'FeaturedArtist',
    filter: {},
    sort: { position: 1, featuredOn: -1 },
    acceptableLeadingFields: ['position'],
    requiredKeyPrefix: ['position', 'featuredOn'],
  },
  {
    // artist-repository.ts primary bio-image subquery — artistId + isPrimary,
    // sortOrder sort.
    label: 'ArtistBioImage primary subquery (artistId + isPrimary + sortOrder)',
    collection: 'ArtistBioImage',
    filter: { artistId: 'probe-artist', isPrimary: true },
    sort: { sortOrder: 1 },
    acceptableLeadingFields: ['artistId'],
    requiredKeyPrefix: ['artistId', 'isPrimary', 'sortOrder'],
  },
  {
    // artist-repository.ts bio-link ordering — artistId filter, sortOrder sort.
    label: 'ArtistBioLink ordering (artistId + sortOrder)',
    collection: 'ArtistBioLink',
    filter: { artistId: 'probe-artist' },
    sort: { sortOrder: 1 },
    acceptableLeadingFields: ['artistId'],
    requiredKeyPrefix: ['artistId', 'sortOrder'],
  },
  {
    // video-artist-repository.ts findByVideoId — videoId filter, sortOrder sort.
    label: 'VideoArtist.findByVideoId (videoId + sortOrder)',
    collection: 'VideoArtist',
    filter: { videoId: 'probe-video' },
    sort: { sortOrder: 1 },
    acceptableLeadingFields: ['videoId'],
    requiredKeyPrefix: ['videoId', 'sortOrder'],
  },
  {
    // tours/venue-repository.ts findRecent — createdAt desc sort.
    label: 'Venue.findRecent (createdAt sort)',
    collection: 'Venue',
    filter: {},
    sort: { createdAt: -1 },
    acceptableLeadingFields: ['createdAt'],
    requiredKeyPrefix: ['createdAt'],
  },
  {
    // user-repository.ts findSmsOptedInUsers — opted-in + phone set.
    label: 'User.findSmsOptedInUsers (allowSmsNotifications + phone)',
    collection: 'User',
    filter: { allowSmsNotifications: true, phone: { $ne: null } },
    acceptableLeadingFields: ['allowSmsNotifications'],
    requiredKeyPrefix: ['allowSmsNotifications', 'phone'],
  },
  {
    // banned-identity-repository.ts findActiveMatch (email branch).
    label: 'BannedIdentity.findActiveMatch (email + unbannedAt)',
    collection: 'BannedIdentity',
    filter: {
      email: 'probe@example.com',
      $or: [{ unbannedAt: null }, { unbannedAt: { $exists: false } }],
    },
    acceptableLeadingFields: ['email'],
    requiredKeyPrefix: ['email', 'unbannedAt'],
  },
  {
    // banned-identity-repository.ts findActiveMatch (fingerprint branch).
    label: 'BannedIdentity.findActiveMatch (fingerprintHash + unbannedAt)',
    collection: 'BannedIdentity',
    filter: {
      fingerprintHash: 'probe-fingerprint',
      $or: [{ unbannedAt: null }, { unbannedAt: { $exists: false } }],
    },
    acceptableLeadingFields: ['fingerprintHash'],
    requiredKeyPrefix: ['fingerprintHash', 'unbannedAt'],
  },
  {
    // banned-identity-repository.ts findActiveMatch (userId branch).
    label: 'BannedIdentity.findActiveMatch (userId + unbannedAt)',
    collection: 'BannedIdentity',
    filter: {
      userId: 'probe-user',
      $or: [{ unbannedAt: null }, { unbannedAt: { $exists: false } }],
    },
    acceptableLeadingFields: ['userId'],
    requiredKeyPrefix: ['userId', 'unbannedAt'],
  },
  {
    // release-repository.ts published count — publishedAt `$ne null` filter.
    label: 'Release published count (publishedAt)',
    collection: 'Release',
    filter: {
      publishedAt: { $ne: null },
      $or: [{ deletedOn: null }, { deletedOn: { $exists: false } }],
    },
    acceptableLeadingFields: ['publishedAt'],
    requiredKeyPrefix: ['publishedAt'],
  },
];

interface ListIndexesResult {
  cursor?: { firstBatch?: Array<{ name?: string; key?: Record<string, number> }> };
}

interface CountResult {
  n?: number;
}

/**
 * Guard: refuse to run unless E2E_DATABASE_URL is a valid URL pointing at the
 * local Docker MongoDB (localhost:27018). Throws otherwise.
 */
const assertLocalE2eUrl = (url: string): void => {
  try {
    new URL(url);
  } catch {
    throw new Error(
      'check-query-plans refusing to run: E2E_DATABASE_URL is not a valid URL. ' +
        'Expected mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0.'
    );
  }
  if (!url.includes('localhost:27018')) {
    throw new Error(
      'check-query-plans refusing to run against a non-local database. ' +
        'It only runs against the Docker E2E MongoDB on localhost:27018.'
    );
  }
};

/** The PASS/SKIP/FAIL outcome of analyzing one target query. */
interface TargetResult {
  status: 'PASS' | 'FAIL' | 'SKIP';
  note: string;
  /** True only when the target is a hard FAIL (counts toward the exit code). */
  failed: boolean;
}

/** Build the human-readable note for a PASS verdict. */
const passNote = (verdict: PlanVerdict): string => {
  const scaleSuffix = verdict.winningIsCollscan
    ? ' (collscan wins at this data size; index applies at scale)'
    : '';
  const sortSuffix = verdict.winningHasBlockingSort ? ' [blocking SORT]' : '';
  return `index: ${verdict.consideredIndexes.join(', ') || 'n/a'}${scaleSuffix}${sortSuffix}`;
};

/**
 * Turn an explain verdict into a PASS/SKIP/FAIL result. Pure (no IO) so it is
 * unit-tested directly. A target with `requiredKeyPrefix` must additionally have
 * the specific compound index considered — a shared leading field is not enough.
 */
export const classifyPlan = ({
  verdict,
  docCount,
  indexNames,
  requiredKeyPrefix,
}: {
  verdict: PlanVerdict;
  docCount: number;
  indexNames: string[];
  requiredKeyPrefix?: string[];
}): TargetResult => {
  const prefixConsidered =
    !requiredKeyPrefix || matchesKeyPrefix(verdict.consideredKeyPatterns, requiredKeyPrefix);

  if (verdict.usesAcceptableIndex && prefixConsidered) {
    return { status: 'PASS', note: passNote(verdict), failed: false };
  }
  if (docCount === 0) {
    return {
      status: 'SKIP',
      note: 'collection empty — cannot plan; seed data to verify applicability',
      failed: false,
    };
  }
  if (verdict.usesAcceptableIndex && !prefixConsidered) {
    return {
      status: 'FAIL',
      note: `leading-field index present but no considered index covers [${(requiredKeyPrefix ?? []).join(', ')}] (${docCount} docs). indexes present: ${indexNames.join(', ')}`,
      failed: true,
    };
  }
  return {
    status: 'FAIL',
    note: `no applicable index scan considered (${docCount} docs). indexes present: ${indexNames.join(', ')}`,
    failed: true,
  };
};

/**
 * Run the index/count/explain commands for one target and classify the result.
 * Extracted from runChecks to keep that function within the complexity ceiling.
 */
const checkTarget = async (prisma: PrismaClient, target: QueryTarget): Promise<TargetResult> => {
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

  return classifyPlan({
    verdict,
    docCount,
    indexNames,
    requiredKeyPrefix: target.requiredKeyPrefix,
  });
};

const runChecks = async (): Promise<void> => {
  assertLocalE2eUrl(E2E_DATABASE_URL);

  const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
  let failures = 0;

  try {
    console.info(`\nQuery-plan check against ${E2E_DATABASE_URL}\n`);

    for (const target of TARGETS) {
      const { status, note, failed } = await checkTarget(prisma, target);
      if (failed) failures += 1;

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
