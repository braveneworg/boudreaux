#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Rewrite the release links stored in artist bios from the old release page,
 * `/releases/<id>`, to the release deep link,
 * `/releases?artist=<slug>&release=<id>` (ADR-0023): the `href`s in the long,
 * short and promotional bio HTML, and the urls of the bio link-palette rows.
 * The slug is the release's public album artist's, else the bio artist's own.
 * Idempotent: a bio with no `/releases/<id>` link left plans no write.
 *
 * Usage (DATABASE_URL scoped to the command; see AGENTS.md hard constraint 1):
 *
 *   DATABASE_URL='<url>' pnpm run backfill:bio-release-links            # dry run
 *   DATABASE_URL='<url>' pnpm run backfill:bio-release-links -- --execute
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

import { creditOrderBy } from '../src/lib/repositories/_internal/credit-order';
import { publicCredits } from '../src/lib/utils/artist-release-credits';
import { releaseDeepLinkHref } from '../src/lib/utils/release-deep-link';

dotenv.config({ path: '.env.local' });
dotenv.config();

const TAG = '[backfill-bio-release-links]';

/** The bio HTML fields a release link can sit in. */
type BioField = 'bio' | 'shortBio' | 'altBio';

export interface BioSource {
  id: string;
  slug: string;
  bio: string | null;
  shortBio: string | null;
  altBio: string | null;
  bioLinks: Array<{ id: string; url: string }>;
}

/** A release's full credit order, each artist with its slug and public gate fields. */
export interface ReleaseCreditSource {
  id: string;
  artistReleases: Array<{
    artist: { slug: string; publishedOn: Date | null; deletedOn: Date | null };
  }>;
}

export interface BioLinkRewritePlan {
  artistUpdates: Array<{ id: string; data: Partial<Record<BioField, string>> }>;
  linkUpdates: Array<{ id: string; url: string }>;
  /** Legacy palette rows whose deep link the artist already holds. */
  linkDeletes: string[];
}

export interface BackfillDeps {
  prisma?: PrismaClient;
  log?: (line: string) => void;
}

/** An old release-page `href` in stored bio HTML. */
const RELEASE_PAGE_HREF = /href="\/releases\/([a-f0-9]{24})"/gi;
/** An old release-page palette url. */
const RELEASE_PAGE_URL = /^\/releases\/([a-f0-9]{24})$/i;

/**
 * Plan every rewrite: each bio HTML field whose `href="/releases/<id>"` links
 * change (written HTML-escaped, `&amp;`, as the sanitizer stores it), and each
 * palette row whose `/releases/<id>` url becomes the deep link.
 */
export const planBioLinkRewrites = (
  bios: BioSource[],
  releases: ReleaseCreditSource[]
): BioLinkRewritePlan => {
  const albumArtistSlug = new Map(
    releases.map(({ id, artistReleases }) => [
      id,
      publicCredits(artistReleases).albumArtist?.slug ?? null,
    ])
  );
  const deepLinkFor = (releaseId: string, bioSlug: string): string =>
    releaseDeepLinkHref(albumArtistSlug.get(releaseId) ?? bioSlug, releaseId);

  const plan: BioLinkRewritePlan = { artistUpdates: [], linkUpdates: [], linkDeletes: [] };
  for (const source of bios) {
    const fields: Array<[BioField, string | null]> = [
      ['bio', source.bio],
      ['shortBio', source.shortBio],
      ['altBio', source.altBio],
    ];
    const rewrites = fields.flatMap(([field, html]) => {
      const rewritten = html?.replace(
        RELEASE_PAGE_HREF,
        (_match, releaseId: string) =>
          `href="${deepLinkFor(releaseId, source.slug).replaceAll('&', '&amp;')}"`
      );
      return rewritten && rewritten !== html ? [[field, rewritten] as const] : [];
    });
    if (rewrites.length > 0) {
      plan.artistUpdates.push({ id: source.id, data: Object.fromEntries(rewrites) });
    }

    const heldUrls = new Set(source.bioLinks.map(({ url }) => url));
    for (const { id, url } of source.bioLinks) {
      const releaseId = RELEASE_PAGE_URL.exec(url)?.[1];
      if (!releaseId) continue;
      const deepLink = deepLinkFor(releaseId, source.slug);
      if (heldUrls.has(deepLink)) {
        plan.linkDeletes.push(id);
      } else {
        plan.linkUpdates.push({ id, url: deepLink });
        heldUrls.add(deepLink);
      }
    }
  }
  return plan;
};

const loadBios = (prisma: PrismaClient): Promise<BioSource[]> =>
  prisma.artist.findMany({
    select: {
      id: true,
      slug: true,
      bio: true,
      shortBio: true,
      altBio: true,
      bioLinks: { select: { id: true, url: true } },
    },
  });

const loadReleases = (prisma: PrismaClient): Promise<ReleaseCreditSource[]> =>
  prisma.release.findMany({
    select: {
      id: true,
      artistReleases: {
        orderBy: creditOrderBy,
        select: { artist: { select: { slug: true, publishedOn: true, deletedOn: true } } },
      },
    },
  });

/** Orchestrates the dry-run / execute flow, owning the client unless one is injected. */
export const backfillBioReleaseLinks = async (
  argv: string[],
  deps: BackfillDeps = {}
): Promise<void> => {
  if (!process.env.DATABASE_URL) {
    throw new Error(`${TAG} DATABASE_URL env var is required`);
  }
  const prisma = deps.prisma ?? new PrismaClient();
  const log = deps.log ?? ((line: string): void => console.info(line));

  try {
    const [bios, releases] = await Promise.all([loadBios(prisma), loadReleases(prisma)]);
    const { artistUpdates, linkUpdates, linkDeletes } = planBioLinkRewrites(bios, releases);
    const linkCount = linkUpdates.length + linkDeletes.length;
    log(
      `${TAG} ${artistUpdates.length} bio(s) and ${linkCount} palette link(s) of ${bios.length} artist(s) link the old release page.`
    );
    if (artistUpdates.length === 0 && linkCount === 0) {
      return;
    }
    if (!argv.includes('--execute')) {
      log(`${TAG} Dry run. Re-run with --execute to rewrite them.`);
      return;
    }
    await prisma.$transaction([
      ...artistUpdates.map(({ id, data }) => prisma.artist.update({ where: { id }, data })),
      ...linkUpdates.map(({ id, url }) =>
        prisma.artistBioLink.update({ where: { id }, data: { url } })
      ),
      ...linkDeletes.map((id) => prisma.artistBioLink.delete({ where: { id } })),
    ]);
    log(`${TAG} Rewrote ${artistUpdates.length} bio(s) and ${linkCount} palette link(s).`);
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
  process.argv[1]?.endsWith('backfill-bio-release-links.ts')
) {
  backfillBioReleaseLinks(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
