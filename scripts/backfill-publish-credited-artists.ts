#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One-time backfill for ADR-0015: publish the credited artists of releases
 * that were published before a release's credits had to be confirmed.
 *
 * It follows the same rule as the server: an artist is published only when a
 * human confirmed that artist. So the run has two steps.
 *
 * 1. Dry run (the default). Writes a candidates file: one line per artist that
 *    is credited on a published release and hidden only for want of a
 *    `publishedOn`, showing what would go live (bio state, display image
 *    count) and the releases that credit it. It also reports the credits that
 *    stay hidden whatever is published. Nothing is written to the database.
 * 2. Review the file and delete the lines you do not want published. Then run
 *    with `--execute --ids-file <path> --published-by <userId>`. Only the ids
 *    left in the file are published. If any id is not a current candidate the
 *    whole run is refused and nothing is written.
 *
 * An artist left unpublished keeps its releases public without that byline.
 *
 * The web server caches the public listings per process for ten minutes, and a
 * script cannot clear that cache: bylines appear once it expires.
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill-publish-credited-artists.ts [--out <path>]
 *   pnpm exec tsx scripts/backfill-publish-credited-artists.ts --execute \
 *     --ids-file <path> --published-by <userId>
 *
 * Required env: DATABASE_URL (the target database — run on the Docker Mongo
 * first, then prod).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

import {
  creditAwaitingConfirmationWhere,
  creditConfirmationSelect,
  creditThatStaysHiddenWhere,
  hiddenCreditSelect,
} from '../src/lib/repositories/_internal/artist-where';
import { releaseWhere } from '../src/lib/repositories/_internal/release-where';
import {
  toCreditAwaitingConfirmation,
  toCreditThatStaysHidden,
  type CreditAwaitingConfirmation,
  type CreditThatStaysHidden,
} from '../src/lib/utils/credit-confirmation';
import { isValidObjectId } from '../src/lib/utils/validation/object-id';

dotenv.config({ path: '.env.local' });
dotenv.config();

const TAG = '[backfill-publish-credited-artists]';

const DEFAULT_OUT_PATH = join(tmpdir(), 'backfill-publish-credited-artists.tsv');

/** Credits on any listed release, the scope of the whole backfill. */
const ON_ANY_LISTED_RELEASE = { release: releaseWhere.listed };

/** A credit awaiting confirmation plus the listed releases that credit it. */
export interface BackfillCandidate extends CreditAwaitingConfirmation {
  releaseTitles: string[];
}

/** The ids to publish, and the ids the reviewed file holds that are not candidates. */
export interface PublishPlan {
  publishIds: string[];
  unknownIds: string[];
}

/** Everything the orchestrator touches outside its own logic, injectable for tests. */
export interface BackfillDeps {
  prisma?: PrismaClient;
  readFile?: (path: string) => string;
  writeFile?: (path: string, text: string) => void;
  log?: (line: string) => void;
  now?: () => Date;
}

interface CreditedReleaseRow {
  release: { title: string; publishedAt: Date | null; deletedOn: Date | null };
}

const isListed = ({ release }: CreditedReleaseRow): boolean =>
  release.publishedAt != null && release.deletedOn == null;

const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Collapse tabs and line breaks so a value cannot break the file's columns. */
const oneCell = (value: string): string => value.replace(/\s+/g, ' ').trim();

const bioCell = ({ bioState, bioGeneratedAt }: CreditAwaitingConfirmation): string =>
  bioState === 'generated' && bioGeneratedAt
    ? `bio: generated ${bioGeneratedAt.toISOString().slice(0, 10)}`
    : `bio: ${bioState}`;

/** Loads every artist the backfill may publish, ordered by displayed name. */
export const loadCandidates = async (prisma: PrismaClient): Promise<BackfillCandidate[]> => {
  const rows = await prisma.artist.findMany({
    where: creditAwaitingConfirmationWhere(ON_ANY_LISTED_RELEASE),
    select: {
      ...creditConfirmationSelect,
      releases: {
        select: { release: { select: { title: true, publishedAt: true, deletedOn: true } } },
      },
    },
  });
  return rows
    .map(({ releases, ...row }) => ({
      ...toCreditAwaitingConfirmation(row),
      releaseTitles: releases.filter(isListed).map(({ release }) => release.title),
    }))
    .sort(byName);
};

/** Loads the credits on listed releases that stay hidden whatever is published. */
export const loadStayHidden = async (prisma: PrismaClient): Promise<CreditThatStaysHidden[]> => {
  const rows = await prisma.artist.findMany({
    where: creditThatStaysHiddenWhere(ON_ANY_LISTED_RELEASE),
    select: hiddenCreditSelect,
  });
  return rows.map(toCreditThatStaysHidden).sort(byName);
};

/** Renders the candidates file: comment header, then one line per candidate. */
export const formatCandidatesFile = (candidates: BackfillCandidate[]): string =>
  [
    '# Candidates for publication (ADR-0015).',
    '# Delete the line of every artist that must stay hidden, then run:',
    '#   --execute --ids-file <this file> --published-by <userId>',
    '# Columns: id, slug, name, bio, display images, releases',
    ...candidates.map((candidate) =>
      [
        candidate.id,
        candidate.slug,
        oneCell(candidate.name),
        bioCell(candidate),
        `images: ${candidate.displayImageCount}`,
        candidate.releaseTitles.map(oneCell).join('; '),
      ].join('\t')
    ),
    '',
  ].join('\n');

/**
 * Reads the artist ids out of a reviewed candidates file: the first column of
 * every line that is neither blank nor a `#` comment.
 *
 * @throws When a line does not start with an ObjectId, so a damaged file is
 *   never half-applied.
 */
export const parseIdsFile = (text: string): string[] => {
  const ids = text.split('\n').flatMap((line, index) => {
    if (line.trim() === '' || line.startsWith('#')) {
      return [];
    }
    const [id] = line.split('\t');
    if (!isValidObjectId(id.trim())) {
      throw new Error(`${TAG} line ${index + 1} does not start with an artist id: "${id}"`);
    }
    return [id.trim()];
  });
  return [...new Set(ids)];
};

/** Splits reviewed ids into those still awaiting confirmation and the rest. */
export const planPublish = (ids: string[], candidates: BackfillCandidate[]): PublishPlan => {
  const candidateIds = new Set(candidates.map(({ id }) => id));
  return {
    publishIds: ids.filter((id) => candidateIds.has(id)),
    unknownIds: ids.filter((id) => !candidateIds.has(id)),
  };
};

const valueOf = (argv: string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
};

const dryRun = async (
  argv: string[],
  prisma: PrismaClient,
  { writeFile, log }: Required<Pick<BackfillDeps, 'writeFile' | 'log'>>
): Promise<void> => {
  const outPath = valueOf(argv, '--out') ?? DEFAULT_OUT_PATH;
  const candidates = await loadCandidates(prisma);
  const stayHidden = await loadStayHidden(prisma);

  writeFile(outPath, formatCandidatesFile(candidates));

  log(`${TAG} DRY RUN`);
  log(`  candidates for publication: ${candidates.length}`);
  log(`  candidates file: ${outPath}`);
  log(`  credits that stay hidden whatever is published: ${stayHidden.length}`);
  for (const { slug, name, reason } of stayHidden) {
    log(`    • ${slug} (${name}): ${reason}`);
  }
  log('  Review the file, delete the lines to keep hidden, then re-run with');
  log(`  --execute --ids-file ${outPath} --published-by <userId>`);
};

const execute = async (
  argv: string[],
  prisma: PrismaClient,
  { readFile, log, now }: Required<Pick<BackfillDeps, 'readFile' | 'log' | 'now'>>
): Promise<void> => {
  const idsPath = valueOf(argv, '--ids-file');
  if (!idsPath) {
    throw new Error(`${TAG} --execute requires --ids-file <path>`);
  }
  const publishedBy = valueOf(argv, '--published-by');
  if (!publishedBy || !isValidObjectId(publishedBy)) {
    throw new Error(`${TAG} --execute requires --published-by <userId>`);
  }

  const ids = parseIdsFile(readFile(idsPath));
  const { publishIds, unknownIds } = planPublish(ids, await loadCandidates(prisma));
  if (unknownIds.length > 0) {
    throw new Error(
      `${TAG} ${unknownIds.length} id(s) are not unpublished credits on a published release: ` +
        `${unknownIds.join(', ')}. Nothing was written.`
    );
  }
  if (publishIds.length === 0) {
    log(`${TAG} The reviewed file holds no ids. Nothing was written.`);
    return;
  }

  const { count } = await prisma.artist.updateMany({
    where: { id: { in: publishIds }, ...creditAwaitingConfirmationWhere(ON_ANY_LISTED_RELEASE) },
    data: { publishedOn: now(), publishedBy },
  });
  log(`${TAG} Published ${count} of ${publishIds.length} reviewed artist(s).`);
  log('  The web server serves cached listings for up to ten minutes.');
};

/** Orchestrates the dry-run / execute flow, owning the client unless one is injected. */
export const backfillPublishCreditedArtists = async (
  argv: string[],
  deps: BackfillDeps = {}
): Promise<void> => {
  if (!process.env.DATABASE_URL) {
    throw new Error(`${TAG} DATABASE_URL env var is required`);
  }

  const prisma = deps.prisma ?? new PrismaClient();
  const io = {
    readFile: deps.readFile ?? ((path: string): string => readFileSync(path, 'utf8')),
    writeFile:
      deps.writeFile ?? ((path: string, text: string): void => writeFileSync(path, text, 'utf8')),
    log: deps.log ?? ((line: string): void => console.info(line)),
    now: deps.now ?? ((): Date => new Date()),
  };

  try {
    await (argv.includes('--execute') ? execute(argv, prisma, io) : dryRun(argv, prisma, io));
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
  process.argv[1]?.endsWith('backfill-publish-credited-artists.ts')
) {
  backfillPublishCreditedArtists(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
