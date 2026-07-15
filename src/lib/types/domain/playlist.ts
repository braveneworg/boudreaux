/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hand-written, Prisma-free domain types for the Playlists feature (011-playlists).
 *
 * These are the single source of truth consumed by all backend tasks (repository,
 * service, actions, routes). Zod-inferred API payload types live alongside these
 * in src/lib/validation/playlist-schema.ts and re-export under the same names.
 */

/** Item type union — mirrors the `itemType` string column in PlaylistItem. */
export type PlaylistItemType = 'track' | 'video';

/**
 * Scalar fields of the Prisma `Playlist` model (no relations).
 * Drift-checked against `Prisma.PlaylistGetPayload` in the repository.
 */
export interface PlaylistRecord {
  id: string;
  ownerId: string;
  title: string;
  isPublic: boolean;
  coverImages: string[];
  itemCount: number;
  totalDuration: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Scalar fields of the Prisma `PlaylistItem` model (no relations).
 * Drift-checked against `Prisma.PlaylistItemGetPayload` in the repository.
 */
export interface PlaylistItemRecord {
  id: string;
  playlistId: string;
  itemType: PlaylistItemType;
  trackFileId: string | null;
  releaseId: string | null;
  videoId: string | null;
  title: string;
  artistName: string;
  duration: number;
  sortOrder: number;
  addedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Data accepted by the repository to create a new playlist. */
export interface CreatePlaylistData {
  ownerId: string;
  title: string;
  isPublic: boolean;
  coverImages: string[];
}

/** Partial update data for an existing playlist (all fields optional). */
export interface UpdatePlaylistData {
  title?: string;
  isPublic?: boolean;
  coverImages?: string[];
}

/**
 * Data accepted by the repository to add an item to a playlist.
 * All snapshot display fields must be populated before calling the repo —
 * the service resolves them from the live track/video row.
 */
export interface AddPlaylistItemData {
  itemType: PlaylistItemType;
  trackFileId: string | null;
  releaseId: string | null;
  videoId: string | null;
  title: string;
  artistName: string;
  duration: number;
}

/**
 * What the client sends when adding an item; the server re-resolves all
 * snapshot fields (title, artistName, duration) from the live source row.
 */
export interface PlaylistItemSourceRef {
  itemType: PlaylistItemType;
  trackFileId?: string;
  videoId?: string;
}

/**
 * A single row in the My Playlists list response.
 * `updatedAt` is serialised as an ISO string for JSON transport.
 */
export interface PlaylistListRow {
  id: string;
  title: string;
  isPublic: boolean;
  coverImages: string[];
  itemCount: number;
  totalDuration: number;
  updatedAt: string; // ISO
}

/** Paginated response from GET /api/playlists. */
export interface PlaylistsResponse {
  rows: PlaylistListRow[];
  nextSkip: number | null;
}

/**
 * A resolved playlist item as returned by GET /api/playlists/[id].
 * `available` is false when the source track/video row is missing or
 * unpublished — the owner must remove it manually.
 */
export interface PlaylistItemPayload {
  id: string;
  itemType: PlaylistItemType;
  sortOrder: number;
  title: string;
  artistName: string;
  duration: number;
  available: boolean;
  trackFileId: string | null;
  releaseId: string | null;
  releaseTitle: string | null;
  videoId: string | null;
  coverArt: string | null; // track → release.coverArt; video → posterUrl
  /**
   * Raw S3 key of the streamable source. Tracks only — the MP3_320 CDN
   * behavior is public/unsigned, so exposing the key is safe. ALWAYS null
   * for videos (video access is via signed URL only) and unavailable items.
   */
  s3Key: string | null;
  /**
   * Playable URL. Tracks → unsigned `buildCdnUrl(s3Key)`; videos →
   * CloudFront signed URL (24h). Null for unavailable items or when video
   * signing is unconfigured (dev/E2E).
   */
  streamUrl: string | null;
  /** Video poster image (videos only); null for tracks and unavailable items. */
  posterUrl: string | null;
}

/** Full playlist detail response from GET /api/playlists/[id]. */
export interface PlaylistDetailResponse {
  id: string;
  title: string;
  isPublic: boolean;
  isOwner: boolean;
  coverImages: string[];
  itemCount: number;
  totalDuration: number;
  items: PlaylistItemPayload[];
}

/** A single search result item returned by GET /api/playlists/media-search. */
export interface PlaylistSearchItem {
  key: string;
  itemType: PlaylistItemType;
  title: string;
  artistName: string | null;
  coverArt: string | null;
  duration: number | null;
  source: { trackFileId: string; releaseId: string } | { videoId: string };
  context?: string;
}

/** Group key for the media-search grouped response. */
export type PlaylistSearchGroupKey =
  | 'songs'
  | 'videos'
  | 'publicPlaylists'
  | 'releases'
  | 'artistMatch';

/** Grouped media-search response from GET /api/playlists/media-search. */
export interface PlaylistSearchResponse {
  groups: Array<{ key: PlaylistSearchGroupKey; label: string; items: PlaylistSearchItem[] }>;
}

/**
 * Discriminated-union result type returned by every playlist Server Action.
 * Add-item uses its own `DUPLICATE_ITEM` error signal (callers branch on it
 * without exception flow).
 */
export type PlaylistActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Data returned per-file by `generatePlaylistCoverUploadUrlsAction`.
 * `uploadUrl` is a presigned S3 PUT; `publicUrl` is the CDN URL the client
 * stores in `coverImages` after a successful PUT.
 */
export interface PlaylistCoverUploadTarget {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}
