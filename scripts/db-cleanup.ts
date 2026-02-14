#!/usr/bin/env node

/**
 * Database Cleanup Utility
 *
 * Performs various cleanup operations on the database.
 *
 * Usage:
 *   npx tsx scripts/db-cleanup.ts [--dry-run]
 *
 * Options:
 *   --dry-run  Preview what would be deleted without making changes
 *
 * Operations:
 *   1. Delete ReleaseTrack records with broken release or track references
 *   2. Delete ReleaseTrack records that have no coverArt
 *   3. Delete Track records that have no coverArt
 *   4. Delete TrackArtist records whose track has no coverArt
 *   5. Delete duplicate ReleaseTrack records (same releaseId + trackId pair)
 *   6. Delete Track records with duplicate titles (keeps oldest)
 *   7. Delete all tracks by Dark Time Sunshine
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

const PREFIX = '[DB-CLEANUP]';

function parseArgs(): { dryRun: boolean } {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
  };
}

/**
 * Delete ReleaseTrack records whose releaseId or trackId references
 * a Release or Track that no longer exists in the database (orphaned foreign keys).
 * This must run before operations that use `include` on relations, which would crash.
 */
async function deleteOrphanedReleaseTracks(dryRun: boolean): Promise<number> {
  console.info(`\n${PREFIX} Finding ReleaseTrack records with broken release/track references...`);

  // Fetch all ReleaseTrack records (scalar fields only to avoid relation crashes)
  const allReleaseTracks = await prisma.releaseTrack.findMany({
    select: { id: true, releaseId: true, trackId: true, position: true, coverArt: true },
  });

  // Collect all unique referenced IDs
  const releaseIds = [...new Set(allReleaseTracks.map((rt) => rt.releaseId))];
  const trackIds = [...new Set(allReleaseTracks.map((rt) => rt.trackId))];

  // Query which IDs actually exist
  const [existingReleases, existingTracks] = await Promise.all([
    prisma.release.findMany({
      where: { id: { in: releaseIds } },
      select: { id: true },
    }),
    prisma.track.findMany({
      where: { id: { in: trackIds } },
      select: { id: true },
    }),
  ]);

  const existingReleaseIds = new Set(existingReleases.map((r) => r.id));
  const existingTrackIds = new Set(existingTracks.map((t) => t.id));

  // Find ReleaseTrack records with broken references
  const orphaned = allReleaseTracks.filter(
    (rt) => !existingReleaseIds.has(rt.releaseId) || !existingTrackIds.has(rt.trackId)
  );

  if (orphaned.length === 0) {
    console.info(`${PREFIX} No ReleaseTrack records with broken references found.`);
    return 0;
  }

  console.info(
    `${PREFIX} Found ${orphaned.length} ReleaseTrack record(s) with broken references:\n`
  );

  for (const rt of orphaned) {
    const missingRelease = !existingReleaseIds.has(rt.releaseId);
    const missingTrack = !existingTrackIds.has(rt.trackId);
    const reason = [
      missingRelease ? `release ${rt.releaseId} missing` : '',
      missingTrack ? `track ${rt.trackId} missing` : '',
    ]
      .filter(Boolean)
      .join(', ');
    console.info(`  - ReleaseTrack ${rt.id} | position: ${rt.position} | ${reason}`);
  }

  if (dryRun) {
    console.info(
      `\n${PREFIX} [DRY RUN] Would delete ${orphaned.length} orphaned ReleaseTrack record(s).`
    );
    return 0;
  }

  const ids = orphaned.map((rt) => rt.id);
  const { count } = await prisma.releaseTrack.deleteMany({
    where: { id: { in: ids } },
  });

  console.info(`\n${PREFIX} Deleted ${count} orphaned ReleaseTrack record(s).`);
  return count;
}

/**
 * Delete ReleaseTrack records where coverArt is null or empty string.
 * These are orphaned junction records with no associated cover art.
 */
async function deleteReleaseTracksWithoutCoverArt(dryRun: boolean): Promise<number> {
  console.info(`\n${PREFIX} Finding ReleaseTrack records without coverArt...`);

  const targets = await prisma.releaseTrack.findMany({
    where: {
      OR: [{ coverArt: null }, { coverArt: '' }],
    },
    include: {
      release: { select: { id: true, title: true } },
      track: { select: { id: true, title: true } },
    },
  });

  if (targets.length === 0) {
    console.info(`${PREFIX} No ReleaseTrack records without coverArt found.`);
    return 0;
  }

  console.info(`${PREFIX} Found ${targets.length} ReleaseTrack record(s) without coverArt:\n`);

  for (const rt of targets) {
    console.info(
      `  - ReleaseTrack ${rt.id} | Release: "${rt.release.title}" (${rt.releaseId}) | Track: "${rt.track.title}" (${rt.trackId}) | position: ${rt.position}`
    );
  }

  if (dryRun) {
    console.info(`\n${PREFIX} [DRY RUN] Would delete ${targets.length} ReleaseTrack record(s).`);
    return 0;
  }

  const ids = targets.map((rt) => rt.id);
  const { count } = await prisma.releaseTrack.deleteMany({
    where: { id: { in: ids } },
  });

  console.info(`\n${PREFIX} Deleted ${count} ReleaseTrack record(s).`);
  return count;
}

/**
 * Delete Track records where coverArt is null or empty string.
 * Only deletes non-soft-deleted tracks (deletedOn is null).
 */
async function deleteTracksWithoutCoverArt(dryRun: boolean): Promise<number> {
  console.info(`\n${PREFIX} Finding Track records without coverArt...`);

  const targets = await prisma.track.findMany({
    where: {
      OR: [{ coverArt: null }, { coverArt: '' }],
      deletedOn: null,
    },
    select: {
      id: true,
      title: true,
      audioUrl: true,
      audioUploadStatus: true,
      createdAt: true,
      releaseTracks: {
        select: {
          id: true,
          releaseId: true,
          release: { select: { title: true } },
        },
      },
    },
  });

  if (targets.length === 0) {
    console.info(`${PREFIX} No Track records without coverArt found.`);
    return 0;
  }

  console.info(`${PREFIX} Found ${targets.length} Track record(s) without coverArt:\n`);

  for (const track of targets) {
    const releases =
      track.releaseTracks.length > 0
        ? track.releaseTracks.map((rt) => `"${rt.release.title}" (${rt.releaseId})`).join(', ')
        : 'none';
    console.info(
      `  - Track ${track.id} | "${track.title}" | status: ${track.audioUploadStatus} | releases: ${releases} | created: ${track.createdAt.toISOString()}`
    );
  }

  if (dryRun) {
    console.info(`\n${PREFIX} [DRY RUN] Would delete ${targets.length} Track record(s).`);
    return 0;
  }

  const ids = targets.map((t) => t.id);

  // Delete related ReleaseTrack records first to avoid foreign key issues
  const { count: releaseTrackCount } = await prisma.releaseTrack.deleteMany({
    where: { trackId: { in: ids } },
  });
  if (releaseTrackCount > 0) {
    console.info(`${PREFIX} Deleted ${releaseTrackCount} related ReleaseTrack record(s).`);
  }

  const { count } = await prisma.track.deleteMany({
    where: { id: { in: ids } },
  });

  console.info(`\n${PREFIX} Deleted ${count} Track record(s).`);
  return count;
}

/**
 * Delete TrackArtist records where the related track has no coverArt (null or empty).
 */
async function deleteTrackArtistsWithoutCoverArt(dryRun: boolean): Promise<number> {
  console.info(`\n${PREFIX} Finding TrackArtist records whose track has no coverArt...`);

  const targets = await prisma.trackArtist.findMany({
    where: {
      track: {
        OR: [{ coverArt: null }, { coverArt: '' }],
      },
    },
    include: {
      track: { select: { id: true, title: true, coverArt: true } },
      artist: { select: { id: true, displayName: true, firstName: true, surname: true } },
    },
  });

  if (targets.length === 0) {
    console.info(`${PREFIX} No TrackArtist records with coverArt-less tracks found.`);
    return 0;
  }

  console.info(
    `${PREFIX} Found ${targets.length} TrackArtist record(s) linked to tracks without coverArt:\n`
  );

  for (const ta of targets) {
    const artistName = ta.artist.displayName || `${ta.artist.firstName} ${ta.artist.surname}`;
    console.info(
      `  - TrackArtist ${ta.id} | Artist: "${artistName}" (${ta.artistId}) | Track: "${ta.track.title}" (${ta.trackId})`
    );
  }

  if (dryRun) {
    console.info(`\n${PREFIX} [DRY RUN] Would delete ${targets.length} TrackArtist record(s).`);
    return 0;
  }

  const ids = targets.map((ta) => ta.id);
  const { count } = await prisma.trackArtist.deleteMany({
    where: { id: { in: ids } },
  });

  console.info(`\n${PREFIX} Deleted ${count} TrackArtist record(s).`);
  return count;
}

interface ReleaseTrackRow {
  id: string;
  releaseId: string;
  trackId: string;
  position: number;
  coverArt: string | null;
}

/**
 * Delete duplicate ReleaseTrack records that share the same releaseId + trackId.
 * Keeps the record with the lowest position (earliest ID as tiebreaker) and deletes the rest.
 */
async function deleteDuplicateReleaseTracks(dryRun: boolean): Promise<number> {
  console.info(`\n${PREFIX} Finding duplicate ReleaseTrack records (same releaseId + trackId)...`);

  // Query only scalar fields to avoid crashes from orphaned relations
  const allReleaseTracks: ReleaseTrackRow[] = await prisma.releaseTrack.findMany({
    select: {
      id: true,
      releaseId: true,
      trackId: true,
      position: true,
      coverArt: true,
    },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });

  // Group by releaseId + trackId
  const groups = new Map<string, ReleaseTrackRow[]>();
  for (const rt of allReleaseTracks) {
    const key = `${rt.releaseId}:${rt.trackId}`;
    const group = groups.get(key);
    if (group) {
      group.push(rt);
    } else {
      groups.set(key, [rt]);
    }
  }

  // Find groups with duplicates and collect IDs to delete (keep first, delete rest)
  const idsToDelete: string[] = [];
  const duplicateGroups: { kept: ReleaseTrackRow; deleted: ReleaseTrackRow[] }[] = [];

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const [kept, ...rest] = group;
    idsToDelete.push(...rest.map((rt) => rt.id));
    duplicateGroups.push({ kept, deleted: rest });
  }

  if (idsToDelete.length === 0) {
    console.info(`${PREFIX} No duplicate ReleaseTrack records found.`);
    return 0;
  }

  // Look up release and track titles for display (may be null if orphaned)
  const releaseIds = [...new Set(duplicateGroups.map((g) => g.kept.releaseId))];
  const trackIds = [...new Set(duplicateGroups.map((g) => g.kept.trackId))];

  const [releases, tracks] = await Promise.all([
    prisma.release.findMany({
      where: { id: { in: releaseIds } },
      select: { id: true, title: true },
    }),
    prisma.track.findMany({
      where: { id: { in: trackIds } },
      select: { id: true, title: true },
    }),
  ]);

  const releaseTitleMap = new Map(releases.map((r) => [r.id, r.title]));
  const trackTitleMap = new Map(tracks.map((t) => [t.id, t.title]));

  console.info(
    `${PREFIX} Found ${idsToDelete.length} duplicate ReleaseTrack record(s) across ${duplicateGroups.length} group(s):\n`
  );

  for (const { kept, deleted } of duplicateGroups) {
    const releaseTitle = releaseTitleMap.get(kept.releaseId) ?? '<unknown>';
    const trackTitle = trackTitleMap.get(kept.trackId) ?? '<unknown>';
    console.info(
      `  Release: "${releaseTitle}" (${kept.releaseId}) | Track: "${trackTitle}" (${kept.trackId})`
    );
    console.info(
      `    KEEP: ${kept.id} (position: ${kept.position}, coverArt: ${kept.coverArt ? 'yes' : 'no'})`
    );
    for (const rt of deleted) {
      console.info(
        `    DELETE: ${rt.id} (position: ${rt.position}, coverArt: ${rt.coverArt ? 'yes' : 'no'})`
      );
    }
  }

  if (dryRun) {
    console.info(
      `\n${PREFIX} [DRY RUN] Would delete ${idsToDelete.length} duplicate ReleaseTrack record(s).`
    );
    return 0;
  }

  const { count } = await prisma.releaseTrack.deleteMany({
    where: { id: { in: idsToDelete } },
  });

  console.info(`\n${PREFIX} Deleted ${count} duplicate ReleaseTrack record(s).`);
  return count;
}

interface DuplicateTrackRow {
  id: string;
  title: string;
  coverArt: string | null;
  audioUploadStatus: string;
  createdAt: Date;
}

/**
 * Delete Track records that share the same title.
 * Keeps the oldest track (earliest createdAt, earliest ID as tiebreaker) and deletes the rest.
 * Also cleans up related ReleaseTrack and TrackArtist records for deleted tracks.
 */
async function deleteDuplicateTracks(dryRun: boolean): Promise<number> {
  console.info(`\n${PREFIX} Finding Track records with duplicate titles...`);

  const allTracks: DuplicateTrackRow[] = await prisma.track.findMany({
    where: { deletedOn: null },
    select: {
      id: true,
      title: true,
      coverArt: true,
      audioUploadStatus: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  // Group by title
  const groups = new Map<string, DuplicateTrackRow[]>();
  for (const track of allTracks) {
    const key = track.title.toLowerCase().trim();
    const group = groups.get(key);
    if (group) {
      group.push(track);
    } else {
      groups.set(key, [track]);
    }
  }

  // Find groups with duplicates and collect IDs to delete (keep first, delete rest)
  const idsToDelete: string[] = [];
  const duplicateGroups: { kept: DuplicateTrackRow; deleted: DuplicateTrackRow[] }[] = [];

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const [kept, ...rest] = group;
    idsToDelete.push(...rest.map((t) => t.id));
    duplicateGroups.push({ kept, deleted: rest });
  }

  if (idsToDelete.length === 0) {
    console.info(`${PREFIX} No Track records with duplicate titles found.`);
    return 0;
  }

  console.info(
    `${PREFIX} Found ${idsToDelete.length} duplicate Track record(s) across ${duplicateGroups.length} title(s):\n`
  );

  for (const { kept, deleted } of duplicateGroups) {
    console.info(`  Title: "${kept.title}"`);
    console.info(
      `    KEEP: ${kept.id} | status: ${kept.audioUploadStatus} | coverArt: ${kept.coverArt ? 'yes' : 'no'} | created: ${kept.createdAt.toISOString()}`
    );
    for (const t of deleted) {
      console.info(
        `    DELETE: ${t.id} | status: ${t.audioUploadStatus} | coverArt: ${t.coverArt ? 'yes' : 'no'} | created: ${t.createdAt.toISOString()}`
      );
    }
  }

  if (dryRun) {
    console.info(
      `\n${PREFIX} [DRY RUN] Would delete ${idsToDelete.length} duplicate Track record(s).`
    );
    return 0;
  }

  // Delete related records first
  const { count: releaseTrackCount } = await prisma.releaseTrack.deleteMany({
    where: { trackId: { in: idsToDelete } },
  });
  if (releaseTrackCount > 0) {
    console.info(`${PREFIX} Deleted ${releaseTrackCount} related ReleaseTrack record(s).`);
  }

  const { count: trackArtistCount } = await prisma.trackArtist.deleteMany({
    where: { trackId: { in: idsToDelete } },
  });
  if (trackArtistCount > 0) {
    console.info(`${PREFIX} Deleted ${trackArtistCount} related TrackArtist record(s).`);
  }

  const { count } = await prisma.track.deleteMany({
    where: { id: { in: idsToDelete } },
  });

  console.info(`\n${PREFIX} Deleted ${count} duplicate Track record(s).`);
  return count;
}

/**
 * Delete all tracks associated with the artist "Dark Time Sunshine".
 * Finds the artist by displayName, then deletes all their tracks and related junction records.
 */
async function deleteTracksByDarkTimeSunshine(dryRun: boolean): Promise<number> {
  const artistName = 'Dark Time Sunshine';
  console.info(`\n${PREFIX} Finding tracks by "${artistName}"...`);

  // Find the artist
  const artist = await prisma.artist.findFirst({
    where: {
      OR: [
        { displayName: { equals: artistName, mode: 'insensitive' } },
        { firstName: { equals: artistName, mode: 'insensitive' } },
      ],
    },
    select: { id: true, displayName: true, firstName: true, surname: true },
  });

  if (!artist) {
    console.info(`${PREFIX} Artist "${artistName}" not found.`);
    return 0;
  }

  const name = artist.displayName || `${artist.firstName} ${artist.surname}`;
  console.info(`${PREFIX} Found artist: "${name}" (${artist.id})`);

  // Find all TrackArtist records for this artist
  const trackArtists = await prisma.trackArtist.findMany({
    where: { artistId: artist.id },
    select: { id: true, trackId: true },
  });

  if (trackArtists.length === 0) {
    console.info(`${PREFIX} No tracks found for "${name}".`);
    return 0;
  }

  const trackIds = [...new Set(trackArtists.map((ta) => ta.trackId))];

  // Look up track details for display
  const tracks = await prisma.track.findMany({
    where: { id: { in: trackIds } },
    select: { id: true, title: true, audioUploadStatus: true, coverArt: true, createdAt: true },
  });

  console.info(`${PREFIX} Found ${tracks.length} track(s) by "${name}":\n`);

  for (const t of tracks) {
    console.info(
      `  - Track ${t.id} | "${t.title}" | status: ${t.audioUploadStatus} | coverArt: ${t.coverArt ? 'yes' : 'no'} | created: ${t.createdAt.toISOString()}`
    );
  }

  if (dryRun) {
    console.info(`\n${PREFIX} [DRY RUN] Would delete ${tracks.length} track(s) by "${name}".`);
    return 0;
  }

  // Delete related ReleaseTrack records
  const { count: releaseTrackCount } = await prisma.releaseTrack.deleteMany({
    where: { trackId: { in: trackIds } },
  });
  if (releaseTrackCount > 0) {
    console.info(`${PREFIX} Deleted ${releaseTrackCount} related ReleaseTrack record(s).`);
  }

  // Delete all TrackArtist records for these tracks (not just this artist's)
  const { count: trackArtistCount } = await prisma.trackArtist.deleteMany({
    where: { trackId: { in: trackIds } },
  });
  if (trackArtistCount > 0) {
    console.info(`${PREFIX} Deleted ${trackArtistCount} related TrackArtist record(s).`);
  }

  // Delete the tracks
  const { count } = await prisma.track.deleteMany({
    where: { id: { in: trackIds } },
  });

  console.info(`\n${PREFIX} Deleted ${count} track(s) by "${name}".`);
  return count;
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();

  console.info(`${PREFIX} Starting database cleanup...`);
  if (dryRun) {
    console.info(`${PREFIX} Running in DRY RUN mode — no records will be deleted.\n`);
  }

  let totalDeleted = 0;

  totalDeleted += await deleteOrphanedReleaseTracks(dryRun);
  totalDeleted += await deleteReleaseTracksWithoutCoverArt(dryRun);
  totalDeleted += await deleteTrackArtistsWithoutCoverArt(dryRun);
  totalDeleted += await deleteTracksWithoutCoverArt(dryRun);
  totalDeleted += await deleteDuplicateReleaseTracks(dryRun);
  totalDeleted += await deleteDuplicateTracks(dryRun);
  totalDeleted += await deleteTracksByDarkTimeSunshine(dryRun);

  console.info(`\n${PREFIX} Cleanup complete.`);
  if (dryRun) {
    console.info(`${PREFIX} [DRY RUN] No records were modified.`);
  } else {
    console.info(`${PREFIX} Total records deleted: ${totalDeleted}`);
  }
}

main()
  .catch((error) => {
    console.error(`${PREFIX} Fatal error:`, error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
