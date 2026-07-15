# My Playlists + Playlist Creator — Design

Approved 2026-07-14. Delivery: 3 PRs (`feat/playlists-core`, `feat/playlists-player`, `feat/playlists-player-menu`).

## Context

Signed-in users currently have no way to collect songs across releases. `/playlists` is a
"coming soon" placeholder, and the `MediaPlayer` compound component has an unused
`DotNavMenu` overflow-menu stub whose docstring already anticipates "Add to playlist".
This feature delivers: a My Playlists page with a playlist creator (desktop 2-col, mobile
stacked), a unified media search (songs / videos / public-playlist songs / releases /
artists), playlist CRUD with drag-sort, a playlist player dialog with mixed audio+video
playback, zip downloads in free formats, social sharing, and an "Add to a playlist" menu
on every media player.

## Decisions (user-approved)

1. **Videos in playlists**: play inline in the playlist player (video.js); skipped in downloads.
2. **Download**: server-streamed ZIP in MP3_320KBPS (unlimited) or AAC (each distinct
   release counts against the existing 5-release freemium quota).
3. **Delivery**: 3-PR sequence, each ships green independently.
4. **Visibility**: everything requires sign-in. Public playlists are viewable by any
   signed-in user via shared link AND their songs appear in other users' creator search.
   Private = owner only.

Defaults: max 200 items/playlist; max 4 cover images, 10 MB each; `@@unique([ownerId, title])`;
duplicate song add = confirm → allowed as a second row; ZinePanel accent `kraft`.

## Data model

```prisma
model Playlist {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  ownerId       String   @db.ObjectId
  owner         User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  title         String
  isPublic      Boolean  @default(false)
  coverImages   String[] // 0–4 CDN URLs; tiling is client-side
  itemCount     Int      @default(0) // denormalized, maintained in repo transactions
  totalDuration Int      @default(0) // seconds, denormalized
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  items         PlaylistItem[]

  @@unique([ownerId, title])
  @@index([ownerId, updatedAt(sort: Desc)])
  @@index([isPublic])
}

model PlaylistItem {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  playlistId  String   @db.ObjectId
  playlist    Playlist @relation(fields: [playlistId], references: [id], onDelete: Cascade)
  itemType    String   // 'track' | 'video'
  trackFileId String?  @db.ObjectId // ReleaseDigitalFormatFile id (MP3_320KBPS file)
  releaseId   String?  @db.ObjectId // denormalized for quota math + cover fallback
  videoId     String?  @db.ObjectId
  title       String   // snapshot at add time
  artistName  String   // snapshot
  duration    Int      @default(0) // snapshot seconds
  sortOrder   Int      // dense 0..n-1, full rewrite on reorder ($transaction)
  addedAt     DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([playlistId, sortOrder])
  @@index([trackFileId])
  @@index([videoId])
  @@index([releaseId])
}
```

Rationale: snapshot display fields + live joins for playback — list rows/search/durations
need no per-item joins; s3Keys/cover art always resolved live at read time; items survive
source deletion (`available: false` at read time, skipped in downloads/search, owner
removes manually). No Prisma relations on trackFileId/videoId. No
`@@unique([playlistId, sortOrder])` (Mongo lacks deferred constraints).

## Backend

All Prisma via repositories; business logic in `PlaylistService`; actions/routes thin.

- `playlist-repository.ts`: create / findById / findByIdWithItems /
  findManyByOwner(skip, take, search) / update / delete / findDuplicateItem / addItem /
  removeItem / reorderItems / searchPublicTrackItems. addItem/removeItem/reorderItems are
  `$transaction`s maintaining itemCount/totalDuration and sortOrder compaction.
- Extend `release-digital-format-file-repository.ts`: `findManyByIdsWithRelease` (never
  select `fileSize` BigInt into JSON payloads), `searchTracksByTitle`
  (contains/insensitive, MP3_320KBPS, published + non-deleted release),
  `findManyByFormatIdsAndTrackNumbers` (AAC zip mapping).
- Extend `video-repository.ts`: `findManyByIds`, `searchPublished(q, take)`.
- `playlist-service.ts`: `requireOwned(playlistId, userId)` (missing and unowned both →
  not-found; no existence leak), snapshot construction on add, duplicate/force semantics,
  cover-URL validation, item resolution with `available` flags, `searchMedia` composition
  (5 capped queries in Promise.all, dedupe by trackFileId in priority order).

Server Actions (discriminated union results):

- `playlist-actions.ts`: `createPlaylistAction({ title, isPublic, coverImages?, items? })` —
  accepts initial draft items, returns the hydrated playlist detail;
  `updatePlaylistAction`; `deletePlaylistAction`;
  `generatePlaylistCoverUploadUrlsAction({ playlistId, files[≤4] })` — presigned PUT,
  image MIME allowlist, 10 MB cap, S3 prefix `media/playlists/{playlistId}/`,
  userId-keyed rate-limit tier, requireOwned.
- `playlist-item-actions.ts`: `addPlaylistItemAction({ playlistId, itemType,
trackFileId?|videoId?, force? })` — duplicate + !force → `{ success: false,
error: 'DUPLICATE_ITEM' }`; force → second row. MAX_PLAYLIST_ITEMS=200.
  `removePlaylistItemAction`, `reorderPlaylistItemsAction({ orderedItemIds })` — id-set
  equality enforced.

Cover URL validation: each entry must be a CDN URL under `media/playlists/{playlistId}/`
(no `..`) OR equal an `Image.src` belonging to an artist/release referenced by current
items. Draft save flow: create playlist (no covers) → presigned upload →
`updatePlaylistAction(coverImages)`.

API routes:

- `GET /api/playlists` (withAuth): skip/take(≤100)/search → `{ rows, nextSkip }`;
  `Cache-Control: private, no-store`. Serves the page AND the add-to-playlist picker.
- `GET /api/playlists/[id]` (withAuth) — **PR1** (creator edit mode needs it): owner or
  public else 404. Items resolved live (3 queries) with `available` flags and
  `coverArt` = release.coverArt fallback. **PR2** adds `attachPlaylistItemStreamUrls`
  (MP3 unsigned; videos signed 24h) + `s3Key`/`streamUrl`/`posterUrl` in the payload.
- `GET /api/playlists/media-search?q=` (searchLimiter + withAuth, min 2 chars):

```ts
interface PlaylistSearchItem {
  key: string;
  itemType: 'track' | 'video';
  title: string;
  artistName: string | null;
  coverArt: string | null;
  duration: number | null;
  source: { trackFileId: string; releaseId: string } | { videoId: string };
  context?: string;
}
interface PlaylistSearchResponse {
  groups: Array<{
    key: 'songs' | 'videos' | 'publicPlaylists' | 'releases' | 'artistMatch';
    label: string;
    items: PlaylistSearchItem[];
  }>;
}
```

Groups in priority order, ~8 items each, server-deduped by trackFileId: (1) track-title
matches; (2) published videos; (3) public-playlist track items (isPublic, ownerId≠me)
re-resolved via findManyByIdsWithRelease; (4) release-title matches expanded to MP3_320
files; (5) artist-name matches expanded likewise.

Zip download (PR2) — `GET /api/playlists/[id]/download?format=MP3_320KBPS|AAC`
(+`respond=preflight`), Node runtime, maxDuration=300, modeled on the bundle route's
direct-stream path: format Zod-enum'd to FREE_FORMAT_TYPES (no purchase bypass);
owner-or-public; videos skipped; MP3 free, AAC distinct-release quota via
QuotaEnforcementService + freeDownloadLockService (all-or-nothing pre-stream check,
charge after first prefetched buffer); archiver store-mode, prefetch depth 4, entries
`NN - Artist - Title.ext`; shared helpers extracted to `src/lib/utils/zip-stream.ts`
(pure move from bundle route).

## Frontend

New dir `src/app/components/playlists/`. Page rewritten per the videos-page pattern
(auth gate, prefetch, HydrationBoundary, ZinePanel kraft, Suspense around content that
reads `useSearchParams`).

Layout: CSS-only. Mobile DOM order = my-playlist search (lg:hidden) → creator (or
selected-playlist view) → full playlist list. Desktop `lg:grid lg:grid-cols-2` —
creator left, scrollable list right.

State: `?edit=<playlistId>` URL param (pencil edit + "Open in My Playlists" deep link);
creator machine in `use-playlist-creator.ts` (useReducer); mobile `viewPlaylistId` +
player-dialog id as component state. Creator stays mounted-but-hidden under the mobile
view (drafts survive).

Creator machine: `draft` (local pendingItems; FIRST add opens save dialog; cancel keeps
items + "Unsaved" badge + "Save playlist" button; local duplicate check) → `saved`
(items = server state; add/remove/reorder persist immediately; reorder = local arrayMove
→ action → revert+toast on failure) → `editing` (dialog pre-filled + "Add songs" button
→ close + focus search input). Save in draft = createPlaylistAction with items → seed
detail cache. Result-row extras: "New playlist from this song" → resetToDraft([item]) +
dialog; "Add to another playlist" → inline picker below the row → add to THAT playlist →
toast; DUPLICATE_ITEM → shared confirm → force retry.

Search combobox: cmdk per release-search-combobox; CommandGroup per non-empty group in
spec order; video Badge pill; `CommandItem onSelect` = add; secondary actions are real
buttons with click+pointerdown stopPropagation; enabled ≥2 chars, 300ms debounce,
keepPreviousData, staleTime 30s.

Save dialog: RHF+zodResolver; TextField title; SwitchField public; PlaylistCoverArtField
tabs Upload (≤4, presigned, X-remove) / From artists (deduped coverArts of current items,
tap-select ≤4); tiling preview via PlaylistCoverTiles (1 full / 2 halves / 3 with first
row-span-2 / 4 grid 2×2; object-cover in aspect-square border-2 border-black) — reused at
56px row thumbs and player fallback.

Rows: `[tiles 56px] [title + "n items · Public"] …spacer… [duration] [Trash2][Pencil][Share2][Play]`;
duration via extracted `format-duration.ts` (+`h:mm:ss` ≥1h); trash → AlertDialog; pencil
→ `?edit=`; share → Popover embedding SocialShareWidget with `{origin}/playlists/{id}`
(private: hint + inline "Make public"); play → shared PlaylistPlayerDialog (PR2).

Player dialog (PR2): new light PlaylistPlayer from MediaPlayer leaves (InteractiveCoverArt,
Controls, InfoTickerTape minimal-variant) + VideoPlayerSurface inline (new additive
`onEnded`); keyed subtrees; no forceMount; download row ABOVE player (MP3/AAC popover →
preflight → triggerDownload; quota 403 → toast suggesting MP3; "Videos are skipped in
downloads"); queue list below; useTrackNavigation. Shared-link page `/playlists/[id]`
(sign-in required, owner-or-public else notFound).

Global add-to-playlist (PR3): DotNav stubs rewritten onto Radix Popover (compound API
kept); add-to-playlist-panel lazy (first 5 / client-filtered top-5, plus icons, toast,
duplicate confirm); "Create playlist" → close popover THEN open lazy dialog embedding
the full creator (`variant="embedded"` — metadata form inline, no Dialog-in-Dialog);
"Open in My Playlists" → `/playlists?edit={id}`. Wired into featured-artists-player,
release-player, artist-player (session-gated).

Hooks: use-playlists-query, use-playlist-query, use-playlist-search-query,
use-playlist-mutations (invalidate `playlists.mine` + involved `detail(id)`; create
seeds detail cache). All: fetchAndParse + Zod, AbortSignal, QueryOptionsOverride
trailing param.

## Risks / handling

- Dangling refs: read-time `available:false`; skipped in search/downloads; owner removes.
- AAC quota: all-or-nothing pre-stream; retry free via ALREADY_DOWNLOADED.
- Radix focus layering (documented repo gotcha): embedded creator variant,
  close-popover-then-open-dialog, `pnpm dedupe --check`, E2E `toBeFocused` canary.
- Bundle size: panel + create dialog lazy; creator static only on /playlists.
- video.js lifecycle: keyed subtrees, no forceMount.
- BigInt: never select fileSize into JSON. Complexity ≤10: pre-extracted helpers.
- Public→private flip: live isPublic filter ends exposure immediately.

## Verification

Per task TDD + gate (`typecheck && test:run && lint && format`); coverage ≥ baseline;
E2E per PR on isolated Docker Mongo (`mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`
only); manual smoke per PR (desktop 2-col, mobile ≤767px, codec-agnostic video
expectations locally). Post-merge ops (PR1): `prisma db push` to prod if the deploy
doesn't; verify Playlist/PlaylistItem collections + indexes.
