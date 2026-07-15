/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import {
  MAX_PLAYLIST_ITEMS,
  PLAYLIST_SEARCH_GROUP_LIMIT,
  PLAYLISTS_PAGE_SIZE,
} from '@/lib/constants/playlists';
import { PlaylistRepository } from '@/lib/repositories/playlist-repository';
import { ReleaseDigitalFormatFileRepository } from '@/lib/repositories/release-digital-format-file-repository';
import type { TrackFileWithRelease } from '@/lib/repositories/release-digital-format-file-repository';
import { VideoRepository } from '@/lib/repositories/video-repository';
import type { VideoSummary } from '@/lib/repositories/video-repository';
import { ArtistService } from '@/lib/services/artist-service';
import { ReleaseService } from '@/lib/services/release-service';
import type { Artist } from '@/lib/types/domain/artist';
import { DataError } from '@/lib/types/domain/errors';
import type {
  AddPlaylistItemData,
  PlaylistDetailResponse,
  PlaylistItemPayload,
  PlaylistItemRecord,
  PlaylistItemSourceRef,
  PlaylistItemType,
  PlaylistListRow,
  PlaylistRecord,
  PlaylistSearchGroupKey,
  PlaylistSearchItem,
  PlaylistSearchResponse,
  PlaylistsResponse,
} from '@/lib/types/domain/playlist';
import type { PublishedReleaseDetail } from '@/lib/types/domain/release';
import { computeNextSkip } from '@/lib/types/pagination';
import { buildCdnUrl } from '@/lib/utils/cdn-url';
import type { UpdatePlaylistInput } from '@/lib/validation/playlist-schema';

// =============================================================================
// Inputs / results
// =============================================================================

/** Input for {@link PlaylistService.createWithItems} (post-validation shape). */
export interface CreatePlaylistWithItemsInput {
  title: string;
  isPublic: boolean;
  coverImages: string[];
  items: PlaylistItemSourceRef[];
}

/** Input for {@link PlaylistService.addItem}. */
export interface AddItemInput {
  playlistId: string;
  ref: PlaylistItemSourceRef;
  force: boolean;
}

/**
 * Result of {@link PlaylistService.addItem}: either a duplicate signal (the
 * caller confirms and retries with `force`) or the created item payload.
 */
export type AddItemResult = { duplicate: true } | { duplicate: false; item: PlaylistItemPayload };

// =============================================================================
// Internal shapes
// =============================================================================

/** A source ref resolved against its live row, plus display-only extras. */
interface ResolvedSource {
  data: AddPlaylistItemData;
  coverArt: string | null;
  releaseTitle: string | null;
}

/** Batched live-row lookups keyed by source id (one query per source kind). */
interface SourceMaps {
  tracks: Map<string, TrackFileWithRelease>;
  videos: Map<string, VideoSummary>;
}

/** The minimal shape shared by item records and source refs for batching. */
interface SourceIdCarrier {
  itemType: PlaylistItemType;
  trackFileId?: string | null;
  videoId?: string | null;
}

interface ArtistNameParts {
  displayName: string | null;
  firstName: string;
  surname: string;
}

interface ArtistReleaseTarget {
  releaseId: string;
  artistName: string;
}

// =============================================================================
// Constants
// =============================================================================

const PLAYLIST_NOT_FOUND = 'Playlist not found';

/**
 * Message of the `NOT_FOUND` thrown when an add-item source ref cannot be
 * resolved. Exported so the add-item Server Action can distinguish this case
 * (→ `SOURCE_NOT_FOUND`) from the playlist-level `NOT_FOUND` (same code).
 */
export const SOURCE_NOT_FOUND_MESSAGE = 'Source track or video not found';

/** How many release-title matches are expanded into track suggestions. */
const RELEASE_MATCH_TAKE = 3;

/**
 * Fan-out bound for the artist group: how many artists are matched AND how
 * many of their releases are expanded in total (mirrors the release group).
 */
const ARTIST_EXPANSION_LIMIT = 3;

/** The only format surfaced as playlist tracks (streamable, CDN-cached). */
const MP3_FORMAT_TYPE = 'MP3_320KBPS';

/** The stream/poster subset of {@link PlaylistItemPayload} (PR2). */
type PlaylistItemStreamFields = Pick<PlaylistItemPayload, 's3Key' | 'streamUrl' | 'posterUrl'>;

/** Live stream/poster fields (PR2) — null until attached from the live source row (see attachPlaylistItemStreamUrls, next task). */
const NO_STREAM_FIELDS: PlaylistItemStreamFields = {
  s3Key: null,
  streamUrl: null,
  posterUrl: null,
};

// =============================================================================
// Pure helpers
// =============================================================================

/** Playlist display-name rule: `displayName`, else `firstName surname`. */
const deriveArtistName = ({ displayName, firstName, surname }: ArtistNameParts): string =>
  displayName ?? `${firstName} ${surname}`;

/** Derive the display name of the FIRST artist join row, or null when none. */
const firstArtistName = (artistReleases: Array<{ artist: ArtistNameParts }>): string | null => {
  const [first] = artistReleases;
  return first ? deriveArtistName(first.artist) : null;
};

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const decodesToParentSegment = (segment: string): boolean => {
  try {
    return decodeURIComponent(segment) === '..';
  } catch {
    return false;
  }
};

/** True when any path segment is a raw or percent-encoded `..`. */
const hasParentSegment = (pathname: string): boolean =>
  pathname.split('/').some((segment) => segment === '..' || decodesToParentSegment(segment));

/**
 * The CDN URL prefix that uploaded covers for this playlist must live under,
 * derived from the shared CDN helper (never hardcoded). Null when no playlist
 * id exists yet (create flow) or no CDN domain is configured — the prefix
 * branch then never matches and only item artwork validates.
 */
const coverPrefixUrl = (playlistId: string | null): URL | null =>
  playlistId ? parseUrl(buildCdnUrl(`media/playlists/${playlistId}/`)) : null;

/** Pathname-based check: same CDN origin, under the prefix, no `..` escape. */
const isUploadedCover = (entry: string, prefix: URL | null): boolean => {
  if (!prefix) return false;
  const url = parseUrl(entry);
  if (!url || url.origin !== prefix.origin) return false;
  return url.pathname.startsWith(prefix.pathname) && !hasParentSegment(url.pathname);
};

/**
 * Every cover entry must either be artwork of one of the playlist's items or
 * an upload living under the playlist's own CDN cover prefix. Anything else
 * (foreign origins, traversal, arbitrary strings) throws `INVALID_INPUT`.
 */
const assertCoverImagesValid = (
  playlistId: string | null,
  coverImages: string[],
  resolvedItemArt: string[]
): void => {
  const itemArt = new Set(resolvedItemArt);
  const prefix = coverPrefixUrl(playlistId);
  for (const entry of coverImages) {
    if (!itemArt.has(entry) && !isUploadedCover(entry, prefix)) {
      throw new DataError(
        'INVALID_INPUT',
        'Cover images must be uploaded playlist covers or artwork of playlist items'
      );
    }
  }
};

/** Collect the non-null cover art values of resolved items (cover validation). */
const collectCoverArt = (entries: Array<{ coverArt: string | null }>): string[] =>
  entries.flatMap(({ coverArt }) => (coverArt ? [coverArt] : []));

/**
 * Build snapshot + display data from a live track row. Returns null when the
 * parent release is unpublished — unpublished sources cannot be added.
 */
const toTrackResolved = (file: TrackFileWithRelease): ResolvedSource | null => {
  const { release } = file.format;
  if (!release.publishedAt) return null;
  return {
    data: {
      itemType: 'track',
      trackFileId: file.id,
      releaseId: file.format.releaseId,
      videoId: null,
      title: file.title ?? file.fileName,
      artistName: firstArtistName(release.artistReleases) ?? '',
      duration: file.duration ?? 0,
    },
    coverArt: release.coverArt,
    releaseTitle: release.title,
  };
};

/** Build snapshot + display data from a live (published) video row. */
const toVideoResolved = (video: VideoSummary): ResolvedSource => ({
  data: {
    itemType: 'video',
    trackFileId: null,
    releaseId: null,
    videoId: video.id,
    title: video.title,
    artistName: video.artist,
    duration: video.durationSeconds ?? 0,
  },
  coverArt: video.posterUrl,
  releaseTitle: null,
});

/** Resolve one source ref against the batched lookups, or null when dangling. */
const resolveRefFromMaps = (
  ref: PlaylistItemSourceRef,
  { tracks, videos }: SourceMaps
): ResolvedSource | null => {
  if (ref.itemType === 'track') {
    const file = ref.trackFileId ? tracks.get(ref.trackFileId) : undefined;
    return file ? toTrackResolved(file) : null;
  }
  const video = ref.videoId ? videos.get(ref.videoId) : undefined;
  return video ? toVideoResolved(video) : null;
};

/** Unavailable item: keep the stored snapshot, null out live-only fields. */
const toUnavailablePayload = (item: PlaylistItemRecord): PlaylistItemPayload => ({
  ...NO_STREAM_FIELDS,
  id: item.id,
  itemType: item.itemType,
  sortOrder: item.sortOrder,
  title: item.title,
  artistName: item.artistName,
  duration: item.duration,
  available: false,
  trackFileId: item.trackFileId,
  releaseId: item.releaseId,
  releaseTitle: null,
  videoId: item.videoId,
  coverArt: null,
});

/** Track item payload: live fields when the file row resolved, else snapshot. */
const toTrackPayload = (
  item: PlaylistItemRecord,
  file: TrackFileWithRelease | undefined
): PlaylistItemPayload => {
  if (!file) return toUnavailablePayload(item);
  const { release } = file.format;
  return {
    ...NO_STREAM_FIELDS,
    id: item.id,
    itemType: item.itemType,
    sortOrder: item.sortOrder,
    title: file.title ?? item.title,
    artistName: firstArtistName(release.artistReleases) ?? item.artistName,
    duration: file.duration ?? item.duration,
    available: true,
    trackFileId: item.trackFileId,
    releaseId: release.id,
    releaseTitle: release.title,
    videoId: item.videoId,
    coverArt: release.coverArt,
  };
};

/** Video item payload: live fields when the published lookup resolved it. */
const toVideoPayload = (
  item: PlaylistItemRecord,
  video: VideoSummary | undefined
): PlaylistItemPayload => {
  if (!video) return toUnavailablePayload(item);
  return {
    ...NO_STREAM_FIELDS,
    id: item.id,
    itemType: item.itemType,
    sortOrder: item.sortOrder,
    title: video.title,
    artistName: video.artist,
    duration: video.durationSeconds ?? item.duration,
    available: true,
    trackFileId: item.trackFileId,
    releaseId: null,
    releaseTitle: null,
    videoId: item.videoId,
    coverArt: video.posterUrl,
  };
};

/** Payload for a just-created item (live by construction). */
const toAddedItemPayload = (
  record: PlaylistItemRecord,
  { coverArt, releaseTitle }: ResolvedSource
): PlaylistItemPayload => ({
  ...NO_STREAM_FIELDS,
  id: record.id,
  itemType: record.itemType,
  sortOrder: record.sortOrder,
  title: record.title,
  artistName: record.artistName,
  duration: record.duration,
  available: true,
  trackFileId: record.trackFileId,
  releaseId: record.releaseId,
  releaseTitle,
  videoId: record.videoId,
  coverArt,
});

/** Map a playlist record to a list row (`updatedAt` as ISO for JSON). */
const toListRow = ({
  id,
  title,
  isPublic,
  coverImages,
  itemCount,
  totalDuration,
  updatedAt,
}: PlaylistRecord): PlaylistListRow => ({
  id,
  title,
  isPublic,
  coverImages,
  itemCount,
  totalDuration,
  updatedAt: updatedAt.toISOString(),
});

/** True when the proposed order is exactly the current item id set. */
const isSameIdSet = (orderedItemIds: string[], items: PlaylistItemRecord[]): boolean => {
  const currentIds = new Set(items.map(({ id }) => id));
  return (
    orderedItemIds.length === currentIds.size &&
    new Set(orderedItemIds).size === orderedItemIds.length &&
    orderedItemIds.every((id) => currentIds.has(id))
  );
};

/** Map a live track row to a search suggestion (optionally with a context). */
const trackFileToSearchItem = (
  file: TrackFileWithRelease,
  context?: string
): PlaylistSearchItem => ({
  key: `track:${file.id}`,
  itemType: 'track',
  title: file.title ?? file.fileName,
  artistName: firstArtistName(file.format.release.artistReleases),
  coverArt: file.format.release.coverArt,
  duration: file.duration,
  source: { trackFileId: file.id, releaseId: file.format.releaseId },
  ...(context === undefined ? {} : { context }),
});

/** Map a published video row to a search suggestion. */
const videoToSearchItem = (video: VideoSummary): PlaylistSearchItem => ({
  key: `video:${video.id}`,
  itemType: 'video',
  title: video.title,
  artistName: video.artist,
  coverArt: video.posterUrl,
  duration: video.durationSeconds,
  source: { videoId: video.id },
});

/** Expand a release detail into MP3-track suggestions (capped). */
const releaseDetailToSearchItems = (
  detail: PublishedReleaseDetail,
  { context, artistName }: { context: string; artistName: string | null }
): PlaylistSearchItem[] =>
  detail.digitalFormats
    .filter(({ formatType }) => formatType === MP3_FORMAT_TYPE)
    .flatMap(({ files }) => files)
    .slice(0, PLAYLIST_SEARCH_GROUP_LIMIT)
    .map((file) => ({
      key: `track:${file.id}`,
      itemType: 'track' as const,
      title: file.title ?? file.fileName,
      artistName,
      coverArt: detail.coverArt,
      duration: file.duration,
      source: { trackFileId: file.id, releaseId: detail.id },
      context,
    }));

/**
 * Collect (releaseId, artistName) expansion targets from matched artists in
 * match order, skipping unpublished/soft-deleted releases and duplicates,
 * bounded by {@link ARTIST_EXPANSION_LIMIT} release fetches in total.
 */
const collectArtistReleaseTargets = (artists: Artist[]): ArtistReleaseTarget[] => {
  const targets: ArtistReleaseTarget[] = [];
  const seen = new Set<string>();
  for (const artist of artists) {
    const artistName = deriveArtistName(artist);
    for (const { release } of artist.releases) {
      if (targets.length >= ARTIST_EXPANSION_LIMIT) return targets;
      if (!release.publishedAt || release.deletedOn || seen.has(release.id)) continue;
      seen.add(release.id);
      targets.push({ releaseId: release.id, artistName });
    }
  }
  return targets;
};

/** Fill one group: skip sources already emitted, cap at the group limit. */
const dedupeIntoGroup = (
  candidates: PlaylistSearchItem[],
  seen: Set<string>
): PlaylistSearchItem[] => {
  const items: PlaylistSearchItem[] = [];
  for (const item of candidates) {
    if (items.length >= PLAYLIST_SEARCH_GROUP_LIMIT) break;
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    items.push(item);
  }
  return items;
};

/**
 * Assemble the grouped response in priority order (songs → videos → public
 * playlists → releases → artist), deduping by source key across groups and
 * omitting empty groups entirely.
 */
const assembleSearchGroups = ({
  songs,
  videos,
  publicPlaylists,
  releases,
  artistMatch,
}: Record<PlaylistSearchGroupKey, PlaylistSearchItem[]>): PlaylistSearchResponse => {
  // Declaration order doubles as the cross-group dedupe priority.
  const ordered: ReadonlyArray<{
    key: PlaylistSearchGroupKey;
    label: string;
    candidates: PlaylistSearchItem[];
  }> = [
    { key: 'songs', label: 'Songs', candidates: songs },
    { key: 'videos', label: 'Videos', candidates: videos },
    { key: 'publicPlaylists', label: 'From public playlists', candidates: publicPlaylists },
    { key: 'releases', label: 'From releases', candidates: releases },
    { key: 'artistMatch', label: 'By artist', candidates: artistMatch },
  ];
  const seen = new Set<string>();
  return {
    groups: ordered.flatMap(({ key, label, candidates }) => {
      const items = dedupeIntoGroup(candidates, seen);
      return items.length > 0 ? [{ key, label, items }] : [];
    }),
  };
};

// =============================================================================
// Service
// =============================================================================

/**
 * Business-logic layer for playlists, between the repositories and the Server
 * Actions / API routes. Owns ownership enforcement (missing and unowned are
 * indistinguishable — both `NOT_FOUND`), snapshot resolution from live
 * track/video rows, cover-image validation, the grouped media search, and the
 * playlist limits. Throws `DataError` with vendor-neutral codes; callers map
 * codes to transport-level responses.
 */
export class PlaylistService {
  private static readonly trackFileRepository = new ReleaseDigitalFormatFileRepository();

  /**
   * Load a playlist and assert ownership. Missing and unowned playlists throw
   * the identical `NOT_FOUND` error so callers cannot probe for existence.
   */
  static async requireOwned(playlistId: string, userId: string): Promise<PlaylistRecord> {
    const playlist = await PlaylistRepository.findById(playlistId);
    if (!playlist || playlist.ownerId !== userId) {
      throw new DataError('NOT_FOUND', PLAYLIST_NOT_FOUND);
    }
    return playlist;
  }

  /** As {@link PlaylistService.requireOwned}, but with items eagerly loaded. */
  private static async requireOwnedWithItems(
    playlistId: string,
    userId: string
  ): Promise<PlaylistRecord & { items: PlaylistItemRecord[] }> {
    const playlist = await PlaylistRepository.findByIdWithItems(playlistId);
    if (!playlist || playlist.ownerId !== userId) {
      throw new DataError('NOT_FOUND', PLAYLIST_NOT_FOUND);
    }
    return playlist;
  }

  /**
   * Batch-resolve the live rows behind a set of items/refs: one track-file
   * lookup and one (published-only) video lookup, skipped when empty.
   */
  private static async loadSourceMaps(sources: SourceIdCarrier[]): Promise<SourceMaps> {
    const trackFileIds = sources.flatMap(({ itemType, trackFileId }) =>
      itemType === 'track' && trackFileId ? [trackFileId] : []
    );
    const videoIds = sources.flatMap(({ itemType, videoId }) =>
      itemType === 'video' && videoId ? [videoId] : []
    );
    const [files, videos] = await Promise.all([
      trackFileIds.length > 0
        ? PlaylistService.trackFileRepository.findManyByIdsWithRelease(trackFileIds)
        : Promise.resolve<TrackFileWithRelease[]>([]),
      videoIds.length > 0
        ? VideoRepository.findManyByIds(videoIds)
        : Promise.resolve<VideoSummary[]>([]),
    ]);
    return {
      tracks: new Map(files.map((file): [string, TrackFileWithRelease] => [file.id, file])),
      videos: new Map(videos.map((video): [string, VideoSummary] => [video.id, video])),
    };
  }

  /** Resolve many refs positionally; unresolvable entries come back as null. */
  private static async resolveSources(
    refs: PlaylistItemSourceRef[]
  ): Promise<Array<ResolvedSource | null>> {
    const maps = await PlaylistService.loadSourceMaps(refs);
    return refs.map((ref) => resolveRefFromMaps(ref, maps));
  }

  /**
   * Resolve a client-supplied source ref into repository snapshot data built
   * from the live row (`duration ?? 0`). Returns null when the source row is
   * missing, its release is unpublished, or the video is unpublished/archived.
   */
  static async resolveItemSource(ref: PlaylistItemSourceRef): Promise<AddPlaylistItemData | null> {
    const [resolved] = await PlaylistService.resolveSources([ref]);
    return resolved ? resolved.data : null;
  }

  /** Merge stored items with their live rows into detail payloads. */
  private static async resolveItemPayloads(
    items: PlaylistItemRecord[]
  ): Promise<PlaylistItemPayload[]> {
    const maps = await PlaylistService.loadSourceMaps(items);
    return items.map((item) =>
      item.itemType === 'track'
        ? toTrackPayload(item, item.trackFileId ? maps.tracks.get(item.trackFileId) : undefined)
        : toVideoPayload(item, item.videoId ? maps.videos.get(item.videoId) : undefined)
    );
  }

  /**
   * Fetch a playlist detail visible to `userId`: the owner always sees it,
   * anyone sees it when public. Returns null when missing or private-unowned
   * (indistinguishable). Items are resolved against their live sources —
   * dangling items stay listed with their snapshot but `available: false`.
   */
  static async getOwnedOrPublicDetail(
    playlistId: string,
    userId: string
  ): Promise<PlaylistDetailResponse | null> {
    const playlist = await PlaylistRepository.findByIdWithItems(playlistId);
    if (!playlist) return null;
    const isOwner = playlist.ownerId === userId;
    if (!playlist.isPublic && !isOwner) return null;
    const items = await PlaylistService.resolveItemPayloads(playlist.items);
    return {
      id: playlist.id,
      title: playlist.title,
      isPublic: playlist.isPublic,
      isOwner,
      coverImages: playlist.coverImages,
      itemCount: playlist.itemCount,
      totalDuration: playlist.totalDuration,
      items,
    };
  }

  /**
   * Create a playlist seeded with items. Unresolvable refs are dropped (not
   * an error — the creator flow may race a source going away). Cover images
   * are validated against the resolved items' artwork; uploaded-cover URLs
   * cannot exist yet because the playlist id is only minted here.
   */
  static async createWithItems(
    userId: string,
    { title, isPublic, coverImages, items }: CreatePlaylistWithItemsInput
  ): Promise<PlaylistDetailResponse> {
    const resolved = (await PlaylistService.resolveSources(items)).filter(
      (source): source is ResolvedSource => source !== null
    );
    assertCoverImagesValid(null, coverImages, collectCoverArt(resolved));
    const created = await PlaylistRepository.createWithItems(
      { ownerId: userId, title, isPublic, coverImages },
      resolved.map(({ data }) => data)
    );
    const detail = await PlaylistService.getOwnedOrPublicDetail(created.id, userId);
    if (!detail) throw new DataError('NOT_FOUND', PLAYLIST_NOT_FOUND);
    return detail;
  }

  /**
   * Add one source to an owned playlist. Duplicate sources short-circuit to
   * `{ duplicate: true }` unless `force` is set (the confirm-retry path);
   * the duplicate answer deliberately precedes the item-limit check.
   */
  static async addItem(
    userId: string,
    { playlistId, ref, force }: AddItemInput
  ): Promise<AddItemResult> {
    const playlist = await PlaylistService.requireOwned(playlistId, userId);
    const [resolved] = await PlaylistService.resolveSources([ref]);
    if (!resolved) throw new DataError('NOT_FOUND', SOURCE_NOT_FOUND_MESSAGE);
    if (!force) {
      const existing = await PlaylistRepository.findDuplicateItem(playlistId, ref);
      if (existing) return { duplicate: true };
    }
    if (playlist.itemCount >= MAX_PLAYLIST_ITEMS) {
      throw new DataError('LIMIT_EXCEEDED', `Playlists are limited to ${MAX_PLAYLIST_ITEMS} items`);
    }
    const record = await PlaylistRepository.addItem(playlistId, resolved.data);
    return { duplicate: false, item: toAddedItemPayload(record, resolved) };
  }

  /**
   * Remove an item from an owned playlist. The item must belong to that
   * playlist — the guard closes the cross-playlist deletion hole a raw
   * repository call would allow.
   */
  static async removeItem(userId: string, playlistId: string, itemId: string): Promise<void> {
    const playlist = await PlaylistService.requireOwnedWithItems(playlistId, userId);
    if (!playlist.items.some((item) => item.id === itemId)) {
      throw new DataError('NOT_FOUND', 'Playlist item not found');
    }
    await PlaylistRepository.removeItem(playlistId, itemId);
  }

  /**
   * Rewrite the playlist order. The proposed ids must be exactly the current
   * item id set (no missing, foreign, or repeated ids) or `INVALID_INPUT`.
   */
  static async reorder(
    userId: string,
    playlistId: string,
    orderedItemIds: string[]
  ): Promise<void> {
    const playlist = await PlaylistService.requireOwnedWithItems(playlistId, userId);
    if (!isSameIdSet(orderedItemIds, playlist.items)) {
      throw new DataError(
        'INVALID_INPUT',
        'orderedItemIds must contain every playlist item id exactly once'
      );
    }
    await PlaylistRepository.reorderItems(playlistId, orderedItemIds);
  }

  /**
   * Update an owned playlist. When `coverImages` changes, the entries are
   * validated against the current items' resolved artwork and the playlist's
   * uploaded-cover CDN prefix; scalar-only updates skip item resolution.
   */
  static async update(userId: string, input: UpdatePlaylistInput): Promise<PlaylistRecord> {
    const { playlistId, ...data } = input;
    if (data.coverImages === undefined) {
      await PlaylistService.requireOwned(playlistId, userId);
      return PlaylistRepository.update(playlistId, data);
    }
    const playlist = await PlaylistService.requireOwnedWithItems(playlistId, userId);
    const payloads = await PlaylistService.resolveItemPayloads(playlist.items);
    assertCoverImagesValid(playlistId, data.coverImages, collectCoverArt(payloads));
    return PlaylistRepository.update(playlistId, data);
  }

  /** Delete an owned playlist (items cascade in the repository). */
  static async delete(userId: string, playlistId: string): Promise<void> {
    await PlaylistService.requireOwned(playlistId, userId);
    await PlaylistRepository.delete(playlistId);
  }

  /**
   * Validate proposed cover images for an existing playlist: each entry must
   * live under the playlist's uploaded-cover CDN prefix (pathname-checked, no
   * `..` escapes) or appear in `resolvedItemArt`. Throws `INVALID_INPUT`.
   */
  static validateCoverImages(
    playlist: PlaylistRecord,
    coverImages: string[],
    resolvedItemArt: string[]
  ): void {
    assertCoverImagesValid(playlist.id, coverImages, resolvedItemArt);
  }

  /** Page through the caller's playlists (newest-touched first). */
  static async getMyPlaylists(
    userId: string,
    {
      skip = 0,
      take = PLAYLISTS_PAGE_SIZE,
      search,
    }: { skip?: number; take?: number; search?: string }
  ): Promise<PlaylistsResponse> {
    const records = await PlaylistRepository.findManyByOwner(userId, {
      skip,
      take,
      ...(search === undefined ? {} : { search }),
    });
    return { rows: records.map(toListRow), nextSkip: computeNextSkip(records.length, skip, take) };
  }

  /**
   * Grouped media search for the playlist creator: five capped source queries
   * in parallel, then priority-ordered assembly with cross-group dedupe by
   * source key. Failing sub-searches degrade to an omitted group.
   */
  static async searchMedia(q: string, userId: string): Promise<PlaylistSearchResponse> {
    const [songFiles, videos, publicPlaylists, releases, artistMatch] = await Promise.all([
      PlaylistService.trackFileRepository.searchTracksByTitle(q, PLAYLIST_SEARCH_GROUP_LIMIT),
      VideoRepository.searchPublished(q, PLAYLIST_SEARCH_GROUP_LIMIT),
      PlaylistService.searchPublicPlaylistItems(q, userId),
      PlaylistService.searchReleaseMatches(q),
      PlaylistService.searchArtistMatches(q),
    ]);
    return assembleSearchGroups({
      songs: songFiles.map((file) => trackFileToSearchItem(file)),
      videos: videos.map(videoToSearchItem),
      publicPlaylists,
      releases,
      artistMatch,
    });
  }

  /**
   * Track items of OTHER users' public playlists matching the query,
   * re-resolved against live track rows (dangling snapshots are dropped),
   * attributed with the source playlist title.
   */
  private static async searchPublicPlaylistItems(
    q: string,
    userId: string
  ): Promise<PlaylistSearchItem[]> {
    const rows = await PlaylistRepository.searchPublicTrackItems(
      q,
      userId,
      PLAYLIST_SEARCH_GROUP_LIMIT
    );
    const trackFileIds = rows.flatMap(({ trackFileId }) => (trackFileId ? [trackFileId] : []));
    if (trackFileIds.length === 0) return [];
    const files = await PlaylistService.trackFileRepository.findManyByIdsWithRelease(trackFileIds);
    const fileById = new Map(files.map((file): [string, TrackFileWithRelease] => [file.id, file]));
    return rows.flatMap((row) => {
      const file = row.trackFileId ? fileById.get(row.trackFileId) : undefined;
      return file ? [trackFileToSearchItem(file, row.playlist.title)] : [];
    });
  }

  /**
   * Releases whose title matches the query (existing published search entry
   * point), expanded into their MP3 track files, attributed with the release
   * title. Capped at the group limit.
   */
  private static async searchReleaseMatches(q: string): Promise<PlaylistSearchItem[]> {
    const result = await ReleaseService.getPublishedReleases({
      search: q,
      take: RELEASE_MATCH_TAKE,
    });
    if (!result.success) return [];
    const details = await PlaylistService.loadReleaseDetails(result.data.map(({ id }) => id));
    return details
      .flatMap((detail) =>
        releaseDetailToSearchItems(detail, {
          context: detail.title,
          artistName: firstArtistName(detail.artistReleases),
        })
      )
      .slice(0, PLAYLIST_SEARCH_GROUP_LIMIT);
  }

  /** Fetch published release details, dropping ids that fail to resolve. */
  private static async loadReleaseDetails(releaseIds: string[]): Promise<PublishedReleaseDetail[]> {
    const results = await Promise.all(
      releaseIds.map((id) => ReleaseService.getReleaseWithTracks(id))
    );
    return results.flatMap((result) => (result.success ? [result.data] : []));
  }

  /**
   * Artists whose name matches the query (the `/api/artists/search` service
   * path), expanded through their published, non-deleted releases into MP3
   * track files, attributed with the artist's display name.
   */
  private static async searchArtistMatches(q: string): Promise<PlaylistSearchItem[]> {
    const result = await ArtistService.searchPublishedArtists({
      search: q,
      take: ARTIST_EXPANSION_LIMIT,
    });
    if (!result.success) return [];
    const targets = collectArtistReleaseTargets(result.data);
    const expanded = await Promise.all(
      targets.map(async ({ releaseId, artistName }) => {
        const release = await ReleaseService.getReleaseWithTracks(releaseId);
        return release.success
          ? releaseDetailToSearchItems(release.data, { context: artistName, artistName })
          : [];
      })
    );
    return expanded.flat().slice(0, PLAYLIST_SEARCH_GROUP_LIMIT);
  }
}
