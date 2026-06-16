<!-- This Source Code Form is subject to the terms of the Mozilla Public
 License, v. 2.0. If a copy of the MPL was not distributed with this
 file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# boudreaux — Query Hook Sequence Diagrams

UML **system sequence diagrams** for every TanStack Query data hook in
`src/app/hooks/`, tracing the full integration on each read: the calling
component → the hook (`useQuery` / `useInfiniteQuery`) → the fetch helper
→ the GET API route → its auth/rate-limit decorators → the service /
repository layer → Prisma · MongoDB → response validation → and back to the
component, **including every error and alternate path**.

All 34 diagrams are rendered to a single landscape, grayscale PDF:
[query-hook-sequences.pdf](query-hook-sequences.pdf). The Mermaid source for
each diagram lives in [diagrams/](diagrams/). Project conventions referenced
throughout come from [CLAUDE.md](../../../CLAUDE.md).

> **Accessibility:** diagrams are grayscale, high-contrast, and avoid text
> smaller than ~10px so they stay legible in black-and-white print.

---

## How to read these diagrams

The system follows the posture [CLAUDE.md](../../../CLAUDE.md) mandates:
**reads go through GET API route handlers (`src/app/api/`), the repository
layer (`src/lib/repositories/`) wraps all Prisma access, and services
(`src/lib/services/`) hold business logic.** Three boundaries recur in every
diagram:

- **Client vs. server** — the hook and component run in the browser; the
  route, service, repository, and Prisma run on the server.
- **The validation boundary** — `fetchAndParse(url, schema, opts)`
  ([src/app/hooks/fetch-and-parse.ts](../../../src/app/hooks/fetch-and-parse.ts))
  fetches, throws `Error(errorMessage)` on a non-OK response, then calls
  `parseResponse(url, schema, body)`, which `schema.safeParse`s the body and
  throws a **`ResponseValidationError`** on a shape mismatch.
- **Contract-drift telemetry** — a global `QueryCache.onError`
  ([src/app/components/providers.tsx](../../../src/app/components/providers.tsx))
  reports **only** `ResponseValidationError` to `/api/client-errors`
  (server logs). Transient HTTP/network/abort errors are deliberately not
  reported.

### Two patterns you will see

| Pattern            | Marker in the diagram                                                | Behavior                                                                                       |
| ------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Validated**      | a `Zod schema` participant + `safeParse` step + `QueryCache.onError` | Malformed payloads fail loudly at the boundary and are reported as contract drift.             |
| **Unchecked cast** | `response.json() as T` note, no schema participant                   | No runtime validation; a malformed payload surfaces silently downstream and is never reported. |

As of the latest Zod-validation refactor, **all 34 hooks use the Validated
pattern** — the Unchecked-cast row above is historical and no diagram still
depicts it. See the [coverage section](#validation-coverage) below.

---

## Table of contents

**Releases & catalog**

1. [useInfiniteReleasesQuery](#1-useinfinitereleasesquery) · 2. [useInfinitePublishedReleasesQuery](#2-useinfinitepublishedreleasesquery) · 3. [useReleaseListQuery](#3-usereleaselistquery) · 4. [useReleaseQuery](#4-usereleasequery) · 5. [useReleaseRelatedQuery](#5-usereleaserelatedquery) · 6. [useReleaseDigitalFormatsQuery](#6-usereleasedigitalformatsquery) · 7. [useReleaseUserStatusQuery](#7-usereleaseuserstatusquery)

**Artists & featured** 8. [useInfiniteArtistsQuery](#8-useinfiniteartistsquery) · 9. [useArtistListQuery](#9-useartistlistquery) · 10. [useArtistBySlugQuery](#10-useartistbyslugquery) · 11. [useArtistSearchQuery](#11-useartistsearchquery) · 12. [useArtistNavSearchQuery](#12-useartistnavsearchquery) · 13. [useInfiniteFeaturedArtistsQuery](#13-useinfinitefeaturedartistsquery) · 14. [useActiveFeaturedArtistsQuery](#14-useactivefeaturedartistsquery)

**Downloads & commerce** 15. [useDownloadQuotaQuery](#15-usedownloadquotaquery) · 16. [useFreeDownloadStatusQuery](#16-usefreedownloadstatusquery) · 17. [useDownloadAnalyticsQuery](#17-usedownloadanalyticsquery) · 18. [useCollectionQuery](#18-usecollectionquery)

**Tours & venues** 19. [useInfiniteToursQuery](#19-useinfinitetoursquery) · 20. [useTourQuery](#20-usetourquery) · 21. [useTourDatesQuery](#21-usetourdatesquery) · 22. [useVenueSearchQuery](#22-usevenuesearchquery) · 23. [useVenueDetailQuery](#23-usevenuedetailquery)

**Banners & system** 24. [useBannersQuery](#24-usebannersquery) · 25. [useNotificationBannerSearchQuery](#25-usenotificationbannersearchquery) · 26. [useCdnStatusQuery](#26-usecdnstatusquery) · 27. [useHealthStatusQuery](#27-usehealthstatusquery)

**Chat & moderation** 28. [useChatMeQuery](#28-usechatmequery) · 29. [useInfiniteChatMessagesQuery](#29-useinfinitechatmessagesquery) · 30. [useChatPinnedMessagesQuery](#30-usechatpinnedmessagesquery) · 31. [useMentionSearchQuery](#31-usementionsearchquery) · 32. [useChatAdminUsersQuery](#32-usechatadminusersquery) · 33. [useInfiniteAdminUserMessagesQuery](#33-useinfiniteadminusermessagesquery) · 34. [useInfiniteReportedUsersQuery](#34-useinfinitereportedusersquery)

Appendix: [Validation coverage](#validation-coverage) · [Regenerating the PDF](#regenerating-the-pdf)

---

## Releases & catalog

### 1. useInfiniteReleasesQuery

**Validated.** Infinite (`useInfiniteQuery`) admin listing that pages `/api/releases` by skip/offset (`take=24`), forwarding `search`/`published`/`deleted` filters baked into the query key, so changing any resets pagination; `keepPreviousData` holds results during filter transitions. The GET handler gates on `auth()` requiring `role === 'admin'` (401 otherwise) and calls `ReleaseService.getReleases` → `prisma.release.findMany`. Validates against `paginatedResponseSchema(releaseSchema)`; HTTP failures throw `Error('Failed to fetch releases')`, schema drift throws `ResponseValidationError`. PDF page 1.

### 2. useInfinitePublishedReleasesQuery

**Validated.** Public releases listing exported as two hooks: the infinite `useInfinitePublishedReleasesQuery` pages `/api/releases?listing=published` (`take=24`, debounced `search` in the key, `keepPreviousData`), and the sibling `usePublishedReleaseSearchQuery` reuses the same fetcher as a single-page `useQuery` (`limit=20`, `select: page => page.rows`) disabled until the user types, for the search combobox. The unauthenticated `listing=published` branch calls `ReleaseService.getPublishedReleases` → `prisma.release.findMany` (published, non-deleted, `publishedReleaseListingSelect`); `'Database unavailable'` maps to 503. Validates against `paginatedResponseSchema(publishedReleaseListingSchema)`. PDF page 2.

### 3. useReleaseListQuery

**Validated.** Backs the admin form release pickers (`release-select`, `release-multi-select`), fetching `/api/releases` with optional `search`/`take`/`artistIds[]` and returning just the `rows`. Its `fetchReleaseList` goes through `fetchAndParse`, validating the body against `z.object({ rows: releaseListItemSchema[] })`, so schema drift throws `ResponseValidationError` (reported via `QueryCache.onError`); HTTP failures throw `Error('Failed to fetch releases')`. The admin route requires an `auth()` admin session (401 otherwise). PDF page 3.

### 4. useReleaseQuery

**Validated.** Fetches one published release with its tracks from `/api/releases/{id}?withTracks=true` (rate-limited public route), which calls `ReleaseService.getReleaseWithTracks`, serializes BigInts to numbers, and attaches S3 stream URLs. Returns `null` on 404 and throws `Error('Failed to fetch release')` for any other non-OK status; on 200 it validates the body with `parseResponse` against `publishedReleaseDetailSchema` (drift throws `ResponseValidationError`). Gated by a non-empty `releaseId`. PDF page 4.

### 5. useReleaseRelatedQuery

**Validated.** Powers the "more by this artist" carousel in `release-detail-content`, hitting `/api/releases/{id}/related` (optional `artistId`), gated to run only when `releaseId` is truthy. The rate-limited GET validates the id as an ObjectId (400), short-circuits to `{ releases: [] }` with no `artistId`, else calls `ReleaseService.getArtistOtherReleases`. Validates against inline `z.object({ releases: array(releaseCarouselItemSchema) })`; `Error('Failed to fetch related releases')` on HTTP failure. PDF page 5.

### 6. useReleaseDigitalFormatsQuery

**Validated.** Fetches a release's published, downloadable digital formats from `/api/releases/{id}/digital-formats` via `fetchAndParse`, validating against `releaseDigitalFormatsResponseSchema` (array of `{ formatType, fileName }`). The route reads `ReleaseDigitalFormatRepository.findAllByRelease`, filtering to formats that have files or an S3 key. `Error('Failed to fetch digital formats')` on non-OK; gated by `releaseId`. PDF page 6.

### 7. useReleaseUserStatusQuery

**Validated (direct `parseResponse`).** Fetches the authenticated user's purchase status, download count/reset window, and available formats from `/api/releases/{id}/user-status` (`withAuth`). It fetches directly, special-cases a **401 by returning `null`**, then validates with `parseResponse` against `releaseUserStatusResponseSchema`. Gated on a non-empty `releaseId` and `useSession()` being `'authenticated'`. PDF page 7.

---

## Artists & featured

### 8. useInfiniteArtistsQuery

**Validated.** Infinite admin artists listing (`artist-data-view`), paging `/api/artists` (`take=24`) with filters in the key and `keepPreviousData`. The GET handler requires an admin `auth()` session (401 otherwise) and delegates to `ArtistService.getArtists` → `prisma.artist.findMany`. Validates against `paginatedResponseSchema(artistSchema)`. PDF page 8.

### 9. useArtistListQuery

**Validated.** Backs the admin form artist pickers (`ArtistMultiSelect`, debounced ~300ms), fetching `/api/artists` (`search`, `take`) — an admin-only route guarded by inline `auth()` — and returning `rows`. Goes through `fetchAndParse` (with `keepPreviousData`), validating against `z.object({ rows: artistListItemSchema[] })` so drift throws `ResponseValidationError`; any non-OK status, including the 401, throws `Error('Failed to fetch artists')`. PDF page 9.

### 10. useArtistBySlugQuery

**Validated.** Fetches one artist (plus published releases and signed stream URLs) by slug from `/api/artists/slug/{slug}?withReleases=true` (rate-limited), which validates the slug regex and calls `ArtistService.getArtistBySlugWithReleases`. Special-cases a **404 to `null`** and throws `Error('Failed to fetch artist')` otherwise; on 200 it validates the body with `parseResponse` against `artistWithPublishedReleasesSchema` (drift throws `ResponseValidationError`). Gated on a non-empty `slug`. PDF page 10.

### 11. useArtistSearchQuery

**Validated.** Searches published artists in "full" format via `/api/artists/search?q=&format=full` (rate-limited), which calls `ArtistService.searchPublishedArtists({ take: 50 })`. Uses `fetchAndParse` + inline `artistSearchResponseSchema`; `Error('Failed to search artists')` on non-OK. Gated on `query.length > 0`, `keepPreviousData`. (Exported and tested, but currently has no live call site.) PDF page 11.

### 12. useArtistNavSearchQuery

**Validated.** Drives the nav/header artist typeahead by hitting the **same** `/api/artists/search` endpoint with **no `format` param**, returning the lightweight combobox shape (`{ results: [{ artistSlug, artistName, thumbnailSrc, releases }] }`) from `ArtistService.searchPublishedArtists({ take: 20 })`. Validates via inline `artistNavSearchResponseSchema`; gates on `query.length >= 3` (mirroring the server's `< 3 → []` short-circuit); consumers debounce ~250ms. PDF page 12.

### 13. useInfiniteFeaturedArtistsQuery

**Validated.** Infinite admin featured-artists listing paging `/api/featured-artists` without the `active` param (`take=24`), with `keepPreviousData` and `refetchOnMount: 'always'` so create/edit returns show fresh data. The route is `withRateLimit(publicLimiter)` and, in admin mode, requires admin `auth()`, calling `FeaturedArtistsService.getAllFeaturedArtists` (`serializeForResponse` applied). Validates against `paginatedResponseSchema(featuredArtistSchema)`. PDF page 13.

### 14. useActiveFeaturedArtistsQuery

**Validated.** Public homepage spotlight (`home-content`), hitting `/api/featured-artists?active=true&limit=7`. The rate-limited route calls `FeaturedArtistsService.getFeaturedArtists` (a `withCache`-wrapped `findMany` filtered to published + within the featured window), then `serializeForResponse` + `attachStreamUrls`, returning CDN-cacheable JSON. Validates against inline `z.object({ featuredArtists: array(featuredArtistSchema), count })`. PDF page 14.

---

## Downloads & commerce

### 15. useDownloadQuotaQuery

**Validated.** Fetches the signed-in viewer's freemium download quota from `/api/user/download-quota` (`withAuth`) via `fetchAndParse`, validating against `downloadQuotaResponseSchema` (`{ success, remainingQuota, downloadedReleaseIds }`). The route delegates to `QuotaEnforcementService.getQuotaStatus`. No 401 special-casing — any non-OK throws `Error('Failed to fetch download quota')`. Consumed by `format-download-list`. PDF page 15.

### 16. useFreeDownloadStatusQuery

**Validated.** Reads `/api/releases/{id}/download/free-status` (rate-limited, `no-store`) for the visitor's free-download cap status plus the subset of `FREE_FORMAT_TYPES` actually published; the route resolves an anonymous visitor identity (cookie + fingerprint), reissues the `boudreaux_visitor_id` cookie, and queries `freeDownloadQuotaService.assertFreeDownloadAllowed`. Validates the 200 body with `parseResponse` against `FreeStatusResponseSchema` (drift throws `ResponseValidationError`), 30s `staleTime`, throwing `Error('Failed to fetch free download status')` on non-OK. PDF page 16.

### 17. useDownloadAnalyticsQuery

**Validated.** Admin download analytics from `/api/releases/{id}/download-analytics` (`withAdmin`), building optional `startDate`/`endDate` ISO params from the `dateRange` selector. The route runs three `DownloadEventRepository` aggregations in parallel; validates against `downloadAnalyticsResponseSchema` (extra response keys ignored). Any non-OK (401/403/400/500) throws `Error('Failed to fetch download analytics')`. PDF page 17.

### 18. useCollectionQuery

**Validated (direct `parseResponse`).** Fetches the signed-in user's purchased collection from `/api/user/collection` (`withAuth`) → `PurchaseRepository.findAllByUser` (purchases with nested release/images/artist/format/download data, plus `count` and `isAdmin`). Fetches directly and special-cases a **401 by throwing `Error('Unauthorized')`** (not `null`), then validates with `parseResponse` against the large inline `collectionResponseSchema`. PDF page 18.

---

## Tours & venues

### 19. useInfiniteToursQuery

**Validated.** Infinite-scroll public tours listing paging `/api/tours` (rate-limited), where the route delegates to `TourRepository.findAll` (`tour.findMany` with `buildSearchWhere` and full relation includes — tourDates→venue/headliners→artist, images). Validates each page against `paginatedResponseSchema(tourWithRelationsSchema)`; debounced `search` is in the key, `keepPreviousData` smooths transitions, `getNextPageParam` follows `nextSkip`. PDF page 19.

### 20. useTourQuery

**Validated.** Fetches a single tour by id from `/api/tours/{tourId}` (rate-limited), which validates the id and calls `TourRepository.findById`. Maps a **404 to `null`** and throws `Error('Failed to fetch tour')` otherwise; on 200 it reads `data.tour ?? data` to tolerate either envelope, then validates that with `parseResponse` against `tourWithRelationsSchema` (drift throws `ResponseValidationError`). CDN-cacheable. PDF page 20.

### 21. useTourDatesQuery

**Validated (loose schema).** Fetches a tour's dates from `/api/tours/{tourId}/dates` (rate-limited) → `TourDateRepository.findByTourId`; an invalid ObjectId returns `{ tourDates: [] }`. Goes through `fetchAndParse` with `cache: 'no-store'` and validates against a permissive `z.object({ tourDates: z.array(z.record(z.string(), z.unknown())) })`, so date rows are loosely typed. `Error('Failed to fetch tour dates')` on non-OK. PDF page 21.

### 22. useVenueSearchQuery

**Validated.** Backs the admin tour-date venue combobox, fetching `/api/venues?search=` (rate-limited) → `VenueRepository.findAll({ limit: 50 })` when a term is present, or `findRecent(5)` otherwise. Goes through `fetchAndParse` and validates against `z.object({ venues: venueSearchItemSchema[] })` (drift throws `ResponseValidationError`), unwraps `{ venues }`, `keepPreviousData`; `Error('Failed to fetch venues')` on non-OK. PDF page 22.

### 23. useVenueDetailQuery

**Validated.** Loads a single venue's full record for the `VenueSelect` edit dialog from `/api/venues/{venueId}` (rate-limited), which validates the ObjectId then calls `VenueRepository.findById`. Goes through `fetchAndParse` and validates against `z.object({ venue: venueDetailSchema })` (drift throws `ResponseValidationError`), gated on a non-empty `venueId`; any non-OK — including a 404 (no `null` special-case here) — throws `Error('Failed to fetch venue details')`. PDF page 23.

---

## Banners & system

### 24. useBannersQuery

**Validated.** Fetches the active notification-banner carousel from `/api/notification-banners` (`server-only`, rate-limited) backed by `BannerNotificationService.getActiveBanners`, which maps banner slots over `bannerNotification.findMany`, applies display-window activation + HTML sanitization, and memoizes via `withCache`. Validates against inline `bannersApiResponseSchema`. Default `staleTime` 10 min (0 when `NEXT_PUBLIC_DISABLE_BANNERS_CACHE`); a service failure yields 500 → `Error('Failed to fetch banners')`. PDF page 24.

### 25. useNotificationBannerSearchQuery

**Validated.** Admin-only search over notification banners, hitting `/api/notification-banners/search?q=&take=20` (`server-only`, `withAdmin`) → `BannerNotificationService.searchNotifications`. Uses `fetchAndParse` + inline `notificationBannerSearchResponseSchema`; `keepPreviousData` keeps results during keystrokes; unauthorized/failed requests throw `Error('Failed to search notification banners')`. PDF page 25.

### 26. useCdnStatusQuery

**Validated.** Polls the CloudFront cache-invalidation status from `/api/cdn-status` (`withAdmin`), where the route calls AWS `CloudFrontClient.ListInvalidationsCommand` and derives `invalidating`/`ready`/`unknown`/`error`. Uses `fetchAndParse` with `cache: 'no-store'` + inline `cdnStatusSchema`. Self-throttles via `refetchInterval`: re-polls every 30s only while `invalidating`. `Error('Failed to fetch CDN status')` on non-OK. PDF page 26.

### 27. useHealthStatusQuery

**Validated.** Reports DB health from `/api/health` (rate-limited), which calls `checkDatabaseHealth` (`$runCommandRaw({ ping: 1 })`). Fetches through `getApiBaseUrl()`, wraps the request in a 5s `AbortController` combined with the query signal via `AbortSignal.any`, validates the 200 body with `parseResponse` against `healthStatusSchema` (drift throws `ResponseValidationError`), and throws `Error(errorData.database ?? 'Failed to fetch health status')` on non-OK. Tuned for liveness probing: `retry: 10` with custom backoff, `gcTime: 0`/`staleTime: 0`. PDF page 27.

---

## Chat & moderation

> **All seven chat/admin hooks now validate their responses** — each runs the fetched body through `parseResponse` against its named Zod schema (drift throws `ResponseValidationError`, reported via `QueryCache.onError`), all fetch with `cache: 'no-store'`, and live updates arrive via Pusher rather than polling.

### 28. useChatMeQuery

**Validated.** Polls `/api/chat/me` (`withAuth`, `force-dynamic`) to learn whether the viewer is chat-blocked; the route runs `ChatUserRepository.findByUserId` and `BanEvasionService.check` in parallel and returns only `{ blocked }` (ban reasons never leak). `staleTime: 60s`, refetch on focus; `ChatBody` gates it via `enabled`. Validates the body with `parseResponse` against `chatMeResponseSchema` (drift throws `ResponseValidationError`); throws `Error('Failed to load chat status')` on non-OK. PDF page 28.

### 29. useInfiniteChatMessagesQuery

**Validated.** `useInfiniteQuery` over `/api/chat/messages` (`withAuth`); page 1 is the newest 20, each `fetchNextPage` requests an older `{ cursorCreatedAt, cursorId }` slice via `ChatService.listRecent` → `ChatMessageRepository.findRecent` (excludes hidden + disabled/banned authors). Flattens oldest→newest, caps in-memory history at 200. Validates each page with `parseResponse` against `chatMessagesPageSchema` (an array of `chatMessageDtoSchema`, drift throws `ResponseValidationError`); throws `Error('Failed to load chat messages')` on non-OK. PDF page 29.

### 30. useChatPinnedMessagesQuery

**Validated.** Loads the pinned-announcement strip from `/api/chat/pinned` (`withAuth`) → `ChatService.listPinned` → `ChatMessageRepository.findPinned`. `staleTime: 30s`, refetch on focus; live pin/unpin patches this cache via the `messagePinChanged` Pusher event. Validates the body with `parseResponse` against `pinnedResponseSchema` (an array of `chatMessageDtoSchema`, drift throws `ResponseValidationError`); throws `Error('Failed to load pinned messages')` on non-OK. PDF page 30.

### 31. useMentionSearchQuery

**Validated.** Powers the chat `@`-mention autocomplete via `/api/chat/mention-search?q=` (`withAuth`, `server-only`) → `ChatMentionService.searchByPrefix` (`user.findMany` `startsWith`, excluding the caller). Uses an **inline** `queryFn`, trims the prefix to 32 chars, `cache: 'no-store'`, `staleTime: 30s`, gated on `trimmed.length > 0` (consumer debounces 200ms). Validates the body with `parseResponse` against `mentionSearchResponseSchema` (drift throws `ResponseValidationError`); throws `Error('Mention search failed')` on non-OK. PDF page 31.

### 32. useChatAdminUsersQuery

**Validated.** Fetches a paginated, sortable page of `ChatUser` moderation rows from `/api/admin/chat/users` (`withAdmin`) → `ChatAdminService.listChatUsers` → `ChatUserRepository.findManyPaginated` + `count`. `page`/`sortBy`/`sortDirection` are in the key. Validates the body with `parseResponse` against `listChatUsersResultSchema` (drift throws `ResponseValidationError`); throws `Error('Failed to load chat users')` on non-OK (incl. admin 401/403). PDF page 32.

### 33. useInfiniteAdminUserMessagesQuery

**Validated.** `useInfiniteQuery` paginating one user's full chat history (including hidden, for audit) from `/api/admin/chat/users/{userId}/messages` (`withAdmin`) → `ChatAdminService.listUserMessages` → `ChatMessageRepository.findByUserIdForAdmin` (page size 25, computes `nextSkip`). Validates each page with `parseResponse` against `adminUserMessagesResponseSchema` (drift throws `ResponseValidationError`); throws `Error('Failed to load user messages')` on non-OK. PDF page 33.

### 34. useInfiniteReportedUsersQuery

**Validated.** `useInfiniteQuery` over `/api/admin/chat/reported-users` (`withAdmin`) paging users grouped by abuse-report count; the route fetches a globally-sorted `AbuseReportRepository.listReportedUsers` (`abuseReport.groupBy` + `user.findMany`) then applies the `search` filter and `skip`/`take=24` slice in memory. `windowDays`/`search` in the key, `keepPreviousData`; reporter identity omitted from the DTO. Validates each page with `parseResponse` against `paginatedResponseSchema(reportedUserDtoSchema)` (drift throws `ResponseValidationError`); throws `Error('Failed to load reported users')` on non-OK. PDF page 34.

---

## Validation coverage

The diagrams make one cross-cutting fact visible: **all 34 hooks now have a
runtime validation boundary** (and contract-drift telemetry). Every hook runs
its fetched response through `fetchAndParse` (or, for the manual-fetch hooks,
a direct `parseResponse`) against a named Zod schema — a shape mismatch throws
`ResponseValidationError`, which the global `QueryCache.onError` reports to
`/api/client-errors`. **None remain as an unchecked `response.json() as T`
cast.**

All 34, by domain:

- **Releases & catalog:** useInfiniteReleasesQuery, useInfinitePublishedReleasesQuery, useReleaseListQuery, useReleaseQuery, useReleaseRelatedQuery, useReleaseDigitalFormatsQuery, useReleaseUserStatusQuery
- **Artists & featured:** useInfiniteArtistsQuery, useArtistListQuery, useArtistBySlugQuery, useArtistSearchQuery, useArtistNavSearchQuery, useInfiniteFeaturedArtistsQuery, useActiveFeaturedArtistsQuery
- **Downloads & commerce:** useDownloadQuotaQuery, useFreeDownloadStatusQuery, useDownloadAnalyticsQuery, useCollectionQuery
- **Tours & venues:** useInfiniteToursQuery, useTourQuery, useTourDatesQuery, useVenueSearchQuery, useVenueDetailQuery
- **Banners & system:** useBannersQuery, useNotificationBannerSearchQuery, useCdnStatusQuery, useHealthStatusQuery
- **Chat & moderation:** useChatMeQuery, useInfiniteChatMessagesQuery, useChatPinnedMessagesQuery, useMentionSearchQuery, useChatAdminUsersQuery, useInfiniteAdminUserMessagesQuery, useInfiniteReportedUsersQuery

The final 16 (the manual-fetch and chat/admin hooks) were brought into this set
by the most recent Zod-validation refactor; there are no remaining unchecked
candidates.

---

## Regenerating the PDF

No npm install needed. Mermaid loads from a CDN (matching the sibling
[architecture-diagrams](../../architectural-diagrams/)), and the build prints
to PDF with the headless Chromium that Playwright already installs for E2E.
Use Node 24 (the repo's `.nvmrc`) and a network connection:

```bash
cd docs/auto-generated/query-hook-sequences
node build.mjs   # writes diagrams/*.mmd, the .html, and query-hook-sequences.pdf
```

`build.mjs` renders each diagram with `mermaid.render()` and **asserts all 34
SVGs are produced** before printing, so a Mermaid syntax error fails the build
loudly instead of emitting blank pages.

To edit a diagram, change its `src` in [build.mjs](build.mjs) (the `.mmd`
files and the per-page titles are generated from that array) and rerun.

> **Mermaid gotcha:** a `;` inside sequence **message text** is a statement
> separator and breaks the parser — use `·` or `,` instead.
