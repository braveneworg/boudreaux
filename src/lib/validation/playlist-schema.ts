/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import {
  MAX_PLAYLIST_COVER_IMAGE_BYTES,
  MAX_PLAYLIST_COVER_IMAGES,
  MAX_PLAYLIST_ITEMS,
} from '@/lib/constants/playlists';
import type {
  PlaylistDetailResponse,
  PlaylistItemPayload,
  PlaylistListRow,
  PlaylistSearchItem,
  PlaylistSearchResponse,
  PlaylistsResponse,
} from '@/lib/types/domain/playlist';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** 24-character hex MongoDB ObjectId — mirrors the repo-wide convention. */
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

/**
 * Playlist title: trimmed, 1–120 chars.
 * Used both as a standalone validator and inside composite schemas.
 */
export const playlistTitleSchema = z.string().trim().min(1).max(120);

/**
 * Array of cover-image URLs, each 1–2048 chars, max {@link MAX_PLAYLIST_COVER_IMAGES} entries.
 */
export const coverImagesSchema = z
  .array(z.string().min(1).max(2048))
  .max(MAX_PLAYLIST_COVER_IMAGES);

/**
 * Discriminated union for the client-supplied source reference when adding an
 * item to a playlist:
 * - `'track'` requires a valid ObjectId `trackFileId`.
 * - `'video'` requires a valid ObjectId `videoId`.
 */
export const playlistItemSourceRefSchema = z.discriminatedUnion('itemType', [
  z.object({ itemType: z.literal('track'), trackFileId: objectId }),
  z.object({ itemType: z.literal('video'), videoId: objectId }),
]);

/**
 * Input for creating a new playlist. `coverImages` and `items` both default to
 * empty arrays so the caller need not supply them for a title-only playlist.
 */
export const createPlaylistInputSchema = z.object({
  title: playlistTitleSchema,
  isPublic: z.boolean(),
  coverImages: coverImagesSchema.default([]),
  items: z.array(playlistItemSourceRefSchema).max(MAX_PLAYLIST_ITEMS).default([]),
});

/** Inferred type for `createPlaylistInputSchema`. */
export type CreatePlaylistInput = z.infer<typeof createPlaylistInputSchema>;

/**
 * Input for updating an existing playlist. At least one mutable field
 * (`title`, `isPublic`, or `coverImages`) must be present, enforced by
 * `.refine`.
 */
export const updatePlaylistInputSchema = z
  .object({
    playlistId: objectId,
    title: playlistTitleSchema.optional(),
    isPublic: z.boolean().optional(),
    coverImages: coverImagesSchema.optional(),
  })
  .refine(
    ({ title, isPublic, coverImages }) =>
      title !== undefined || isPublic !== undefined || coverImages !== undefined,
    {
      message: 'At least one of title, isPublic, or coverImages must be provided',
    }
  );

/** Inferred type for `updatePlaylistInputSchema`. */
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistInputSchema>;

/**
 * Input for adding an item to a playlist. Merges `playlistItemSourceRefSchema`
 * with `playlistId` and a `force` flag (defaults to `false`).
 *
 * Because `playlistItemSourceRefSchema` is a discriminated union we spread it
 * into an intersection so the discriminant + required id travel together.
 */
export const addPlaylistItemInputSchema = z.intersection(
  playlistItemSourceRefSchema,
  z.object({
    playlistId: objectId,
    force: z.boolean().default(false),
  })
);

/** Inferred type for `addPlaylistItemInputSchema`. */
export type AddPlaylistItemInput = z.infer<typeof addPlaylistItemInputSchema>;

/**
 * Input for reordering all items in a playlist. `orderedItemIds` must contain
 * no duplicates (enforced by `.refine`).
 */
export const reorderPlaylistItemsInputSchema = z
  .object({
    playlistId: objectId,
    orderedItemIds: z.array(objectId).min(1).max(MAX_PLAYLIST_ITEMS),
  })
  .refine(({ orderedItemIds }) => new Set(orderedItemIds).size === orderedItemIds.length, {
    message: 'orderedItemIds must not contain duplicate ids',
    path: ['orderedItemIds'],
  });

/** Inferred type for `reorderPlaylistItemsInputSchema`. */
export type ReorderPlaylistItemsInput = z.infer<typeof reorderPlaylistItemsInputSchema>;

/**
 * Input for requesting presigned S3 PUT URLs for playlist cover images.
 * `files` must contain between 1 and 4 entries; each file must be one of the
 * four supported image MIME types and must not exceed
 * {@link MAX_PLAYLIST_COVER_IMAGE_BYTES}.
 */
export const playlistCoverUploadInputSchema = z.object({
  playlistId: objectId,
  files: z
    .array(
      z.object({
        fileName: z.string().min(1).max(255),
        contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
        fileSize: z.number().int().positive().max(MAX_PLAYLIST_COVER_IMAGE_BYTES),
      })
    )
    .min(1)
    .max(MAX_PLAYLIST_COVER_IMAGES),
});

/** Inferred type for `playlistCoverUploadInputSchema`. */
export type PlaylistCoverUploadInput = z.infer<typeof playlistCoverUploadInputSchema>;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

/**
 * Wire schema for a single row in the My Playlists list response.
 * `updatedAt` travels as an ISO string (not a `Date`) over JSON.
 */
export const playlistListRowSchema: z.ZodType<PlaylistListRow> = z.object({
  id: z.string(),
  title: z.string(),
  isPublic: z.boolean(),
  coverImages: z.array(z.string()),
  itemCount: z.number(),
  totalDuration: z.number(),
  updatedAt: z.string(),
});

/**
 * Wire schema for the paginated `GET /api/playlists` response.
 */
export const playlistsResponseSchema: z.ZodType<PlaylistsResponse> = z.object({
  rows: z.array(playlistListRowSchema),
  nextSkip: z.number().nullable(),
});

/**
 * Wire schema for a resolved playlist item (from GET /api/playlists/[id]).
 * `trackFileId`, `releaseId`, `releaseTitle`, `videoId`, `coverArt`, `s3Key`,
 * `streamUrl`, and `posterUrl` are nullable — the server populates only the
 * fields relevant to `itemType`.
 */
export const playlistItemPayloadSchema: z.ZodType<PlaylistItemPayload> = z.object({
  id: z.string(),
  itemType: z.enum(['track', 'video']),
  sortOrder: z.number(),
  title: z.string(),
  artistName: z.string(),
  duration: z.number(),
  available: z.boolean(),
  trackFileId: z.string().nullable(),
  releaseId: z.string().nullable(),
  releaseTitle: z.string().nullable(),
  videoId: z.string().nullable(),
  coverArt: z.string().nullable(),
  s3Key: z.string().nullable(),
  streamUrl: z.string().nullable(),
  posterUrl: z.string().nullable(),
});

/**
 * Wire schema for the full playlist detail response (GET /api/playlists/[id]).
 */
export const playlistDetailResponseSchema: z.ZodType<PlaylistDetailResponse> = z.object({
  id: z.string(),
  title: z.string(),
  isPublic: z.boolean(),
  isOwner: z.boolean(),
  coverImages: z.array(z.string()),
  itemCount: z.number(),
  totalDuration: z.number(),
  items: z.array(playlistItemPayloadSchema),
});

/**
 * Wire schema for a single item in the media-search response.
 * `source` is a discriminated object (not a Zod discriminated union because
 * the domain type uses a plain TypeScript union).
 */
export const playlistSearchItemSchema: z.ZodType<PlaylistSearchItem> = z.object({
  key: z.string(),
  itemType: z.enum(['track', 'video']),
  title: z.string(),
  artistName: z.string().nullable(),
  coverArt: z.string().nullable(),
  duration: z.number().nullable(),
  source: z.union([
    z.object({ trackFileId: z.string(), releaseId: z.string() }),
    z.object({ videoId: z.string() }),
  ]),
  context: z.string().optional(),
});

/**
 * Wire schema for the grouped media-search response
 * (GET /api/playlists/media-search).
 */
export const playlistSearchResponseSchema: z.ZodType<PlaylistSearchResponse> = z.object({
  groups: z.array(
    z.object({
      key: z.enum(['songs', 'videos', 'publicPlaylists', 'releases', 'artistMatch']),
      label: z.string(),
      items: z.array(playlistSearchItemSchema),
    })
  ),
});
