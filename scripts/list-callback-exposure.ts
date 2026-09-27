#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Read-only inventory for #787: the artists whose bio-generation or
 * images-from-links callback completed while the per-job tokens were publicly
 * readable (from v4.183.0 / v4.352.0 until #785 deployed), so an admin can
 * review or regenerate each one. Reads only — never writes.
 *
 * Usage: `pnpm exec tsx scripts/list-callback-exposure.ts --from <ISO> --to <ISO>`
 * Cross-check each row against CloudWatch (`/aws/lambda/fakefour-bio-generator`)
 * for a matching invocation; a callback with no invocation is a forgery signal.
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

/** The window's bounds, parsed from `--from` / `--to`. */
export interface ExposureWindow {
  from: Date;
  to: Date;
}

/** One artist with content a callback wrote inside the window. */
export interface ExposureRow {
  artistId: string;
  slug: string;
  displayName: string | null;
  /** When the bio was last generated, if inside the window. */
  bioGeneratedAt: Date | null;
  /** Number of `linked` (images-from-links) pool rows created inside the window. */
  linkedImagesInWindow: number;
}

/** Parse `--from` and `--to` (ISO-8601) from argv; throws on a missing or invalid value. */
export const parseWindow = (argv: string[]): ExposureWindow => {
  const read = (flag: string): Date => {
    const index = argv.indexOf(flag);
    const raw = index === -1 ? undefined : argv.at(index + 1);
    const date = raw ? new Date(raw) : new Date(NaN);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`${flag} must be an ISO-8601 date, got ${raw ?? '(missing)'}`);
    }
    return date;
  };
  const from = read('--from');
  const to = read('--to');
  if (to <= from) {
    throw new Error('--to must be after --from');
  }
  return { from, to };
};

/** The Prisma reads the inventory needs — `findMany` only. */
export type ExposureReader = Pick<PrismaClient, 'artist' | 'artistBioImage'>;

/**
 * List every artist whose bio was generated inside the window, or who gained
 * `linked` image rows inside it, sorted by slug. Both are reads of the
 * collections the callbacks write to; nothing is modified.
 */
export const listCallbackExposure = async (
  prisma: ExposureReader,
  { from, to }: ExposureWindow
): Promise<ExposureRow[]> => {
  const [generated, linked] = await Promise.all([
    prisma.artist.findMany({
      where: { bioGeneratedAt: { gte: from, lt: to } },
      select: { id: true, slug: true, displayName: true, bioGeneratedAt: true },
    }),
    prisma.artistBioImage.findMany({
      where: { origin: 'linked', createdAt: { gte: from, lt: to } },
      select: { artistId: true, artist: { select: { slug: true, displayName: true } } },
    }),
  ]);

  const rows = new Map<string, ExposureRow>();
  for (const artist of generated) {
    rows.set(artist.id, {
      artistId: artist.id,
      slug: artist.slug,
      displayName: artist.displayName,
      bioGeneratedAt: artist.bioGeneratedAt,
      linkedImagesInWindow: 0,
    });
  }
  for (const image of linked) {
    const row = rows.get(image.artistId) ?? {
      artistId: image.artistId,
      slug: image.artist.slug,
      displayName: image.artist.displayName,
      bioGeneratedAt: null,
      linkedImagesInWindow: 0,
    };
    row.linkedImagesInWindow += 1;
    rows.set(image.artistId, row);
  }

  return [...rows.values()].sort((a, b) => a.slug.localeCompare(b.slug));
};

/** A plain-text report, one artist per line, for the review checklist. */
export const formatReport = (rows: ExposureRow[], window: ExposureWindow): string => {
  const header = `Callback exposure ${window.from.toISOString()} → ${window.to.toISOString()}: ${rows.length} artist(s)`;
  const lines = rows.map(
    ({ slug, displayName, bioGeneratedAt, linkedImagesInWindow }) =>
      `- ${slug} (${displayName ?? 'no display name'}): bio ${bioGeneratedAt?.toISOString() ?? '—'}, linked images ${linkedImagesInWindow}`
  );
  return [header, ...lines].join('\n');
};

const main = async (): Promise<void> => {
  const window = parseWindow(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const rows = await listCallbackExposure(prisma, window);
    console.info(formatReport(rows, window));
  } finally {
    await prisma.$disconnect();
  }
};

if (process.argv[1]?.endsWith('list-callback-exposure.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
