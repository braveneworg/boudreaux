/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Generate one UML sequence diagram per TanStack Query hook, then print a
// landscape, grayscale PDF. Writes each diagram to diagrams/*.mmd, assembles
// an HTML page (Mermaid from CDN), and prints to PDF with headless Chromium
// via Playwright (already installed for E2E). No new npm dependencies.
//
//   node build.mjs            # diagrams/*.mmd -> *.html -> query-hook-sequences.pdf
//
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const diagramsDir = join(here, 'diagrams');
mkdirSync(diagramsDir, { recursive: true });

/**
 * One diagram per hook. `file` becomes diagrams/<file>; `title` is the page
 * heading; `src` is the Mermaid sequenceDiagram source. Ordered by domain.
 */
const DIAGRAMS = [
  {
    file: '01-use-releases-query.mmd',
    title: '1. useInfiniteReleasesQuery — admin releases listing (infinite)',
    src: `%% useInfiniteReleasesQuery — admin releases listing (infinite)
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(release-data-view)
    participant H as useInfiniteReleasesQuery<br/>(useInfiniteQuery)
    participant F as fetchAndParse
    participant R as GET /api/releases
    participant A as auth()
    participant SV as ReleaseService<br/>.getReleases
    participant DB as Prisma · MongoDB<br/>(release.findMany)
    participant V as paginatedResponseSchema<br/>(releaseSchema)
    participant RC as QueryCache.onError
    C->>H: useInfiniteReleasesQuery({search,published,deleted})
    H->>F: queryFn({pageParam=skip, signal})
    F->>R: fetch(/api/releases?skip&take=24&filters, {signal})
    R->>A: auth() — require role 'admin'
    alt not admin
        A-->>R: no admin session
        R-->>F: 401 Authentication required
        F-->>H: throw Error('Failed to fetch releases')
    else admin
        R->>SV: getReleases({skip,take,search,published,deleted})
        SV->>DB: prisma.release.findMany(where, skip, take, orderBy createdAt desc)
        DB-->>SV: rows
        SV-->>R: { success, data }
        R-->>F: 200 { rows, nextSkip } (private,no-store)
        F->>V: safeParse(body)
        alt valid
            V-->>F: parsed
            F-->>H: page
            H-->>C: data.pages (getNextPageParam=nextSkip, keepPreviousData)
        else contract drift
            V-->>F: error
            F-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    end`,
  },
  {
    file: '02-use-published-releases-query.mmd',
    title: '2. useInfinitePublishedReleasesQuery — public releases (infinite + combobox)',
    src: `%% useInfinitePublishedReleasesQuery (+ usePublishedReleaseSearchQuery)
sequenceDiagram
    autonumber
    actor U as Visitor
    participant C as Component<br/>(releases-content /<br/>release-search-combobox)
    participant H as useInfinitePublishedReleasesQuery<br/>(useInfiniteQuery)
    participant F as fetchAndParse
    participant R as GET /api/releases?listing=published
    participant SV as ReleaseService<br/>.getPublishedReleases
    participant DB as Prisma · MongoDB<br/>(release.findMany select)
    participant V as paginatedResponseSchema<br/>(publishedReleaseListingSchema)
    participant RC as QueryCache.onError
    C->>H: useInfinitePublishedReleasesQuery(search)
    H->>F: queryFn({pageParam=skip, signal})
    F->>R: fetch(/api/releases?listing=published&skip&take=24&search, {signal})
    R->>SV: getPublishedReleases({skip,take,search})
    SV->>DB: findMany(publishedAt not null, not deleted, listing select, releasedOn desc)
    DB-->>SV: rows
    SV-->>R: { success, data }
    R-->>F: 200 { rows, nextSkip } (no-store)
    F->>V: safeParse(body)
    alt valid
        V-->>F: parsed
        F-->>H: page
        H-->>C: data.pages (getNextPageParam=nextSkip, keepPreviousData)
    else contract drift
        V-->>F: error
        F-->>H: throw ResponseValidationError
        H->>RC: onError reports to /api/client-errors
    else not ok / 503 DB unavailable
        R-->>F: 4xx/5xx/503
        F-->>H: throw Error('Failed to fetch releases')
    end`,
  },
  {
    file: '03-use-release-list-query.mmd',
    title: '3. useReleaseListQuery — admin form picker',
    src: `%% useReleaseListQuery — admin form release picker (validated)
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(release-select /<br/>release-multi-select)
    participant H as useReleaseListQuery<br/>(useQuery)
    participant F as fetchAndParse
    participant R as GET /api/releases
    participant A as auth()
    participant SV as ReleaseService.getReleases
    participant DB as Prisma · MongoDB
    participant V as z.object rows:<br/>releaseListItemSchema[]
    participant RC as QueryCache.onError
    C->>H: useReleaseListQuery({search,artistIds,take})
    H->>F: queryFn({signal})
    F->>R: fetch(/api/releases?search&take&artistIds, {signal})
    R->>A: auth() — require role 'admin'
    alt not admin
        A-->>R: no admin session
        R-->>F: 401 Authentication required
        F-->>H: throw Error('Failed to fetch releases')
    else not ok
        R-->>F: 4xx/5xx
        F-->>H: throw Error('Failed to fetch releases')
    else ok
        R->>SV: getReleases({skip:0,take,search,artistIds})
        SV->>DB: prisma.release.findMany(where, orderBy createdAt desc)
        DB-->>SV: rows
        SV-->>R: { success, data }
        R-->>F: 200 { rows, nextSkip } (private,no-store)
        F->>V: safeParse(body)
        alt valid
            V-->>F: parsed
            F-->>H: data
            H-->>C: { data } (keepPreviousData)
        else contract drift
            V-->>F: error
            F-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    end`,
  },
  {
    file: '04-use-release-query.mmd',
    title: '4. useReleaseQuery — single release with tracks (404→null)',
    src: `%% useReleaseQuery — single release with tracks (validated)
sequenceDiagram
    autonumber
    actor U as User
    participant C as Component<br/>(release-detail-content)
    participant H as useReleaseQuery<br/>(useQuery, enabled when releaseId)
    participant Q as fetchRelease
    participant P as parseResponse
    participant R as GET /api/releases/{id}?withTracks=true<br/>(withRateLimit · publicLimiter)
    participant SV as ReleaseService.getReleaseWithTracks
    participant DB as Prisma · MongoDB
    participant V as publishedReleaseDetailSchema
    participant RC as QueryCache.onError
    C->>H: useReleaseQuery(releaseId)
    H->>Q: queryFn({signal})
    Q->>R: fetch(url, {signal})
    alt 404 not found
        R-->>Q: 404
        Q-->>H: return null
    else 200 ok
        R->>SV: getReleaseWithTracks(id)
        SV->>DB: query release + tracks
        DB-->>SV: release
        SV-->>R: { success, data }
        Note over R: serializeRelease (BigInt→Number)<br/>+ attachStreamUrls (S3)
        R-->>Q: 200 JSON (s-maxage=60)
        Q->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: data
            H-->>C: { data }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else 400/500/503 error
        R-->>Q: invalid id / db / 500
        Q-->>H: throw Error('Failed to fetch release')
    end`,
  },
  {
    file: '05-use-release-related-query.mmd',
    title: '5. useReleaseRelatedQuery — "more by this artist" carousel',
    src: `%% useReleaseRelatedQuery — more-by-this-artist carousel
sequenceDiagram
    autonumber
    actor U as Visitor
    participant C as Component<br/>(release-detail-content)
    participant H as useReleaseRelatedQuery<br/>(useQuery, gated on releaseId)
    participant F as fetchAndParse
    participant R as GET /api/releases/{id}/related<br/>(withRateLimit · publicLimiter)
    participant SV as ReleaseService<br/>.getArtistOtherReleases
    participant DB as Prisma · MongoDB
    participant V as z.object releases[]<br/>(releaseCarouselItemSchema)
    participant RC as QueryCache.onError
    C->>H: useReleaseRelatedQuery(releaseId, artistId)
    H->>F: queryFn({signal}) [enabled only if releaseId]
    F->>R: fetch(/api/releases/{id}/related?artistId, {signal})
    alt invalid ObjectId
        R-->>F: 400 Invalid release ID
        F-->>H: throw Error('Failed to fetch related releases')
    else no artistId
        R-->>F: 200 { releases: [] } (s-maxage=60)
    else has artistId
        R->>SV: getArtistOtherReleases(artistId, id)
        SV->>DB: findMany(same artist, exclude id, published, not deleted)
        DB-->>SV: rows
        SV-->>R: { success, data }
        R-->>F: 200 { releases } (s-maxage=60)
    end
    F->>V: safeParse(body)
    alt valid
        V-->>F: parsed
        F-->>H: data
        H-->>C: { releases }
    else contract drift
        V-->>F: error
        F-->>H: throw ResponseValidationError
        H->>RC: onError reports to /api/client-errors
    end`,
  },
  {
    file: '06-use-release-digital-formats-query.mmd',
    title: '6. useReleaseDigitalFormatsQuery — published downloadable formats',
    src: `%% useReleaseDigitalFormatsQuery — published downloadable formats
sequenceDiagram
    autonumber
    actor U as User
    participant C as Component<br/>(format-bundle-download,<br/>purchase-success-step)
    participant H as useReleaseDigitalFormatsQuery<br/>(useQuery, enabled when releaseId)
    participant F as fetchAndParse
    participant R as GET /api/releases/{id}/digital-formats<br/>(withRateLimit · publicLimiter)
    participant RP as ReleaseDigitalFormatRepository<br/>.findAllByRelease
    participant DB as Prisma · MongoDB
    participant V as releaseDigitalFormatsResponseSchema
    participant RC as QueryCache.onError
    C->>H: useReleaseDigitalFormatsQuery(releaseId)
    H->>F: fetchAndParse(url, schema, {signal, errorMessage})
    F->>R: fetch(url, {signal})
    alt 200 ok
        R->>RP: findAllByRelease(releaseId)
        RP->>DB: query digitalFormats + files
        DB-->>RP: formats (filtered to those with files/s3Key)
        RP-->>R: rows
        R-->>F: 200 { formats:[{formatType,fileName}] }
        F->>V: parseResponse → safeParse(body)
        alt valid
            V-->>F: parsed
            F-->>H: data
            H-->>C: { data }
        else contract drift
            V-->>F: error
            F-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else 400/500 error
        R-->>F: invalid id / 500
        F-->>H: throw Error('Failed to fetch digital formats')
    end`,
  },
  {
    file: '07-use-release-user-status-query.mmd',
    title: '7. useReleaseUserStatusQuery — per-user purchase/quota status',
    src: `%% useReleaseUserStatusQuery — per-user purchase/quota status (401→null)
sequenceDiagram
    autonumber
    actor U as User
    participant C as Component<br/>(download-dialog)
    participant H as useReleaseUserStatusQuery<br/>(useQuery, enabled when releaseId & authed)
    participant Q as fetchReleaseUserStatus
    participant P as parseResponse
    participant R as GET /api/releases/{id}/user-status<br/>(withAuth)
    participant PS as PurchaseRepository +<br/>PurchaseService + formats repo
    participant DB as Prisma · MongoDB
    participant V as releaseUserStatusResponseSchema
    participant RC as QueryCache.onError
    C->>H: useReleaseUserStatusQuery(releaseId)
    H->>Q: queryFn({signal})
    Q->>R: fetch(url, {signal})
    alt 401 unauthenticated
        R-->>Q: 401 (withAuth)
        Q-->>H: return null
    else 200 ok
        R->>PS: findByUserAndRelease · getDownloadAccess · findAllByRelease
        PS->>DB: purchase + formats + quota
        DB-->>PS: data
        PS-->>R: status payload
        R-->>Q: 200 { hasPurchase, purchasedAt, downloadCount, resetInHours, availableFormats }
        Q->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: data
            H-->>C: { data }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else other error
        R-->>Q: 500
        Q-->>H: throw Error('Failed to fetch release user status')
    end`,
  },
  {
    file: '08-use-artists-query.mmd',
    title: '8. useInfiniteArtistsQuery — admin artists listing (infinite)',
    src: `%% useInfiniteArtistsQuery — admin artists listing (infinite)
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(artist-data-view)
    participant H as useInfiniteArtistsQuery<br/>(useInfiniteQuery)
    participant F as fetchAndParse
    participant R as GET /api/artists
    participant A as auth()
    participant SV as ArtistService.getArtists
    participant DB as Prisma · MongoDB<br/>(artist.findMany)
    participant V as paginatedResponseSchema<br/>(artistSchema)
    participant RC as QueryCache.onError
    C->>H: useInfiniteArtistsQuery({search,published,deleted})
    H->>F: queryFn({pageParam=skip, signal})
    F->>R: fetch(/api/artists?skip&take=24&filters, {signal})
    R->>A: auth() — require role 'admin'
    alt not admin
        A-->>R: no admin session
        R-->>F: 401 Authentication required
        F-->>H: throw Error('Failed to fetch artists')
    else admin
        R->>SV: getArtists({skip,take,search,published,deleted})
        SV->>DB: prisma.artist.findMany(where, skip, take, orderBy createdAt desc)
        DB-->>SV: rows
        SV-->>R: { success, data }
        R-->>F: 200 { rows, nextSkip } (private,no-store)
        F->>V: safeParse(body)
        alt valid
            V-->>F: parsed
            F-->>H: page
            H-->>C: data.pages (getNextPageParam=nextSkip, keepPreviousData)
        else contract drift
            V-->>F: error
            F-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    end`,
  },
  {
    file: '09-use-artist-list-query.mmd',
    title: '9. useArtistListQuery — admin artist list',
    src: `%% useArtistListQuery — admin artist list (validated)
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as ArtistMultiSelect<br/>(useDebounce 300ms)
    participant H as useArtistListQuery<br/>(useQuery, keepPreviousData)
    participant F as fetchAndParse
    participant R as GET /api/artists?search&take<br/>(inline auth: admin only)
    participant SV as ArtistService.getArtists
    participant DB as Prisma · MongoDB
    participant V as z.object rows:<br/>artistListItemSchema[]
    participant RC as QueryCache.onError
    C->>H: useArtistListQuery({search, take})
    H->>F: queryFn({signal})
    F->>R: fetch(url, {signal})
    R->>R: auth() · require role 'admin'
    alt authorized
        R->>SV: getArtists({skip, take, search})
        SV->>DB: findMany(deletedOn guard, name/slug contains, createdAt desc)
        DB-->>SV: rows
        SV-->>R: { success, data }
        R-->>F: 200 { rows, nextSkip }
        F->>V: safeParse(body)
        alt valid
            V-->>F: parsed
            F-->>H: data
            H-->>C: { data }
        else contract drift
            V-->>F: error
            F-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else not admin
        R-->>F: 401 Authentication required
        F-->>H: throw Error('Failed to fetch artists')
    else db unavailable / error
        R-->>F: 503 / 500
        F-->>H: throw Error('Failed to fetch artists')
    end`,
  },
  {
    file: '10-use-artist-by-slug-query.mmd',
    title: '10. useArtistBySlugQuery — single artist by slug (404→null)',
    src: `%% useArtistBySlugQuery — single artist by slug (validated, 404→null)
sequenceDiagram
    autonumber
    actor U as User
    participant C as ArtistDetailContent
    participant H as useArtistBySlugQuery<br/>(useQuery, enabled !!slug)
    participant Q as fetchArtistBySlug
    participant P as parseResponse
    participant R as GET /api/artists/slug/{slug}?withReleases=true<br/>(withRateLimit · publicLimiter)
    participant SV as ArtistService<br/>.getArtistBySlugWithReleases
    participant DB as Prisma · MongoDB<br/>(artist.findFirst)
    participant V as artistWithPublishedReleasesSchema
    participant RC as QueryCache.onError
    C->>H: useArtistBySlugQuery(slug)
    H->>Q: queryFn({signal})
    Q->>R: fetch(url, {signal})
    R->>R: validate slug regex (else 400)
    R->>SV: getArtistBySlugWithReleases(slug)
    SV->>DB: findFirst(slug, isActive, deletedOn null/isSet:false) + includes
    DB-->>SV: artist | null
    SV-->>R: { success, data } | not found
    alt 200 OK
        R->>R: attachStreamUrls(serializeForResponse(data))
        R-->>Q: 200 JSON
        Q->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: data
            H-->>C: { data }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else 404 not found
        R-->>Q: 404
        Q-->>H: return null
    else other non-ok (400/503/500)
        R-->>Q: 4xx/5xx
        Q-->>H: throw Error('Failed to fetch artist')
    end`,
  },
  {
    file: '11-use-artist-search-query.mmd',
    title: '11. useArtistSearchQuery — full-format artist search',
    src: `%% useArtistSearchQuery — full-format artist search
sequenceDiagram
    autonumber
    actor U as User
    participant C as Consumer<br/>(search results)
    participant H as useArtistSearchQuery<br/>(useQuery, enabled query.length>0)
    participant F as fetchAndParse
    participant R as GET /api/artists/search?q&format=full<br/>(withRateLimit · searchLimiter)
    participant SV as ArtistService<br/>.searchPublishedArtists
    participant DB as Prisma · MongoDB
    participant V as artistSearchResponseSchema
    participant RC as QueryCache.onError
    C->>H: useArtistSearchQuery(query)
    H->>F: queryFn({signal})
    F->>R: fetch(url, {signal})
    R->>SV: searchPublishedArtists({search, take: 50})
    SV->>DB: findMany(isActive, has published release, name contains)
    DB-->>SV: rows
    SV-->>R: { success, data }
    R-->>F: 200 { artists } (s-maxage=60)
    F->>V: safeParse(body)
    alt valid
        V-->>F: parsed
        F-->>H: { artists }
        H-->>C: { data }
    else contract drift
        V-->>F: error
        F-->>H: throw ResponseValidationError
        H->>RC: reports to /api/client-errors
    else response not ok (503/500)
        R-->>F: 4xx/5xx
        F-->>H: throw Error('Failed to search artists')
    end`,
  },
  {
    file: '12-use-artist-nav-search-query.mmd',
    title: '12. useArtistNavSearchQuery — nav typeahead (combobox format)',
    src: `%% useArtistNavSearchQuery — nav typeahead (same endpoint, no format param)
sequenceDiagram
    autonumber
    actor U as User
    participant C as ArtistSearchInput<br/>(useDebounce 250ms)
    participant H as useArtistNavSearchQuery<br/>(useQuery, enabled query.length>=3)
    participant F as fetchAndParse
    participant R as GET /api/artists/search?q<br/>(combobox · searchLimiter)
    participant SV as ArtistService<br/>.searchPublishedArtists
    participant DB as Prisma · MongoDB
    participant V as artistNavSearchResponseSchema
    participant RC as QueryCache.onError
    C->>H: useArtistNavSearchQuery(debouncedQuery)
    H->>F: queryFn({signal})
    F->>R: fetch(url, {signal})
    alt q.length >= 3
        R->>SV: searchPublishedArtists({search, take: 20})
        SV->>DB: findMany + map { artistSlug, artistName, thumbnailSrc, releases }
        DB-->>SV: rows
        SV-->>R: results
        R-->>F: 200 { results }
    else q.length < 3 (server short-circuit)
        R-->>F: 200 { results: [] }
    end
    F->>V: safeParse(body)
    alt valid
        V-->>F: parsed
        F-->>H: { results }
        H-->>C: { data }
    else contract drift
        V-->>F: error
        F-->>H: throw ResponseValidationError
        H->>RC: reports to /api/client-errors
    else response not ok
        R-->>F: 4xx/5xx
        F-->>H: throw Error('Failed to search artists')
    end`,
  },
  {
    file: '13-use-featured-artists-query.mmd',
    title: '13. useInfiniteFeaturedArtistsQuery — admin featured-artists listing (infinite)',
    src: `%% useInfiniteFeaturedArtistsQuery — admin featured-artists listing (infinite)
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(featured-artist-data-view)
    participant H as useInfiniteFeaturedArtistsQuery<br/>(useInfiniteQuery)
    participant F as fetchAndParse
    participant R as GET /api/featured-artists<br/>(withRateLimit publicLimiter)
    participant SV as FeaturedArtistsService<br/>.getAllFeaturedArtists
    participant DB as Prisma · MongoDB
    participant V as paginatedResponseSchema<br/>(featuredArtistSchema)
    participant RC as QueryCache.onError
    C->>H: useInfiniteFeaturedArtistsQuery({search,published,deleted})
    H->>F: queryFn({pageParam=skip, signal})
    F->>R: fetch(/api/featured-artists?skip&take=24 (NO active), {signal})
    R->>SV: auth admin · getAllFeaturedArtists({skip,take,filters})
    alt rate limited
        R-->>F: 429
        F-->>H: throw Error('Failed to fetch featured artists')
    else not admin
        R-->>F: 401 Authentication required
        F-->>H: throw Error('Failed to fetch featured artists')
    else admin
        SV->>DB: findMany(where, orderBy position asc, featuredOn desc)
        DB-->>SV: rows
        SV-->>R: { success, data }
        R-->>F: 200 { rows: serializeForResponse(data), nextSkip } (private,no-store)
        F->>V: safeParse(body)
        alt valid
            V-->>F: parsed
            F-->>H: page (keepPreviousData, refetchOnMount:'always')
            H-->>C: data.pages
        else contract drift
            V-->>F: error
            F-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    end`,
  },
  {
    file: '14-use-active-featured-artists-query.mmd',
    title: '14. useActiveFeaturedArtistsQuery — public homepage spotlight',
    src: `%% useActiveFeaturedArtistsQuery — public homepage spotlight
sequenceDiagram
    autonumber
    actor U as Visitor
    participant C as Component<br/>(home-content)
    participant H as useActiveFeaturedArtistsQuery<br/>(useQuery)
    participant F as fetchAndParse
    participant R as GET /api/featured-artists?active=true&limit=7<br/>(withRateLimit publicLimiter)
    participant SV as FeaturedArtistsService<br/>.getFeaturedArtists (withCache)
    participant DB as Prisma · MongoDB
    participant V as z.object featuredArtists[], count
    participant RC as QueryCache.onError
    C->>H: useActiveFeaturedArtistsQuery()
    H->>F: queryFn({signal})
    F->>R: fetch(/api/featured-artists?active=true&limit=7, {signal})
    R->>SV: getFeaturedArtists(now, 7)
    SV->>DB: findMany(publishedOn not null, featured date window)
    DB-->>SV: rows
    SV-->>R: { success, data }
    R-->>F: 200 { featuredArtists: attachStreamUrls(serialize(data)), count } (s-maxage=60,swr=300)
    F->>V: safeParse(body)
    alt valid
        V-->>F: parsed
        F-->>H: { featuredArtists, count }
        H-->>C: { data }
    else contract drift
        V-->>F: error
        F-->>H: throw ResponseValidationError
        H->>RC: onError reports to /api/client-errors
    else rate limit / not ok
        R-->>F: 429/5xx
        F-->>H: throw Error('Failed to fetch featured artists')
    end`,
  },
  {
    file: '15-use-download-quota-query.mmd',
    title: '15. useDownloadQuotaQuery — viewer free download quota',
    src: `%% useDownloadQuotaQuery — viewer's free download quota
sequenceDiagram
    autonumber
    actor U as User
    participant C as Component<br/>(format-download-list)
    participant H as useDownloadQuotaQuery<br/>(useQuery)
    participant F as fetchAndParse
    participant R as GET /api/user/download-quota<br/>(withAuth)
    participant SV as QuotaEnforcementService<br/>.getQuotaStatus
    participant DB as Prisma · MongoDB
    participant V as downloadQuotaResponseSchema
    participant RC as QueryCache.onError
    C->>H: useDownloadQuotaQuery()
    H->>F: fetchAndParse(url, schema, {signal, errorMessage})
    F->>R: fetch(url, {signal})
    alt 200 ok
        R->>SV: getQuotaStatus({kind:'user', userId})
        SV->>DB: query downloads/quota
        DB-->>SV: status
        SV-->>R: { remainingQuota, downloadedReleaseIds }
        R-->>F: 200 { success, ...status }
        F->>V: parseResponse → safeParse(body)
        alt valid
            V-->>F: parsed
            F-->>H: data
            H-->>C: { data }
        else contract drift
            V-->>F: error
            F-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else 401 / 500 error
        R-->>F: 401 (withAuth) or 500
        F-->>H: throw Error('Failed to fetch download quota')
    end`,
  },
  {
    file: '16-use-free-download-status-query.mmd',
    title: '16. useFreeDownloadStatusQuery — visitor free-download cap',
    src: `%% useFreeDownloadStatusQuery — visitor free-download cap status (validated)
sequenceDiagram
    autonumber
    actor U as Visitor
    participant C as Component<br/>(download-dialog)
    participant H as useFreeDownloadStatusQuery<br/>(useQuery, enabled when releaseId, staleTime 30s)
    participant Q as fetchFreeDownloadStatus
    participant P as parseResponse
    participant R as GET /api/releases/{id}/download/free-status<br/>(withRateLimit · downloadLimiter, no-store)
    participant FS as freeDownloadQuotaService +<br/>format repo
    participant DB as Prisma · MongoDB
    participant V as FreeStatusResponseSchema
    participant RC as QueryCache.onError
    C->>H: useFreeDownloadStatusQuery(releaseId)
    H->>Q: queryFn({signal})
    Q->>R: fetch(url, {signal})
    alt 200 ok
        R->>R: resolve visitor identity (cookie + fingerprint)
        R->>FS: findAllByRelease ∩ FREE_FORMAT_TYPES
        FS->>DB: published free formats
        alt no free formats
            R-->>Q: 200 { allowed:false, blockedReason:'no-free-formats' }
        else cap query
            R->>FS: assertFreeDownloadAllowed(guest, visitorIds, releaseId)
            alt allowed
                FS-->>R: { remaining, resetsAt }
                R-->>Q: 200 { allowed:true, remaining }
            else CapReachedError
                FS-->>R: throw CapReachedError
                R-->>Q: 200 { allowed:false, blockedReason:'cap-reached' }
            end
        end
        Q->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: data
            H-->>C: { data }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else 400/404/500 error
        R-->>Q: invalid id / not_found / 500
        Q-->>H: throw Error('Failed to fetch free download status')
    end`,
  },
  {
    file: '17-use-download-analytics-query.mmd',
    title: '17. useDownloadAnalyticsQuery — admin release download analytics',
    src: `%% useDownloadAnalyticsQuery — admin release download analytics
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(download-analytics-dashboard)
    participant H as useDownloadAnalyticsQuery<br/>(useQuery, enabled when releaseId)
    participant F as fetchAndParse
    participant R as GET /api/releases/{id}/download-analytics?startDate&endDate<br/>(withAdmin)
    participant RP as DownloadEventRepository<br/>(analytics · uniqueUsers · totalDownloads)
    participant DB as Prisma · MongoDB
    participant V as downloadAnalyticsResponseSchema
    participant RC as QueryCache.onError
    C->>H: useDownloadAnalyticsQuery(releaseId, dateRange)
    Note over H,F: getDateRange(range) → start/end ISO params ('all' → none)
    H->>F: fetchAndParse(url, schema, {signal, errorMessage})
    F->>R: fetch(url, {signal})
    alt 200 ok
        R->>RP: Promise.all(analytics, uniqueUsers, totalDownloads)
        RP->>DB: aggregate download events
        DB-->>RP: counts/breakdown
        RP-->>R: results
        R-->>F: 200 { success, totalDownloads, uniqueUsers, formatBreakdown }
        F->>V: parseResponse → safeParse(body)
        alt valid
            V-->>F: parsed (extra keys ignored)
            F-->>H: data
            H-->>C: { data }
        else contract drift
            V-->>F: error
            F-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else 401 / 403 / 400 / 500
        R-->>F: not authed / not admin / bad / 500
        F-->>H: throw Error('Failed to fetch download analytics')
    end`,
  },
  {
    file: '18-use-collection-query.mmd',
    title: '18. useCollectionQuery — viewer purchased collection',
    src: `%% useCollectionQuery — viewer's purchased collection (401 throws 'Unauthorized')
sequenceDiagram
    autonumber
    actor U as User
    participant C as Component<br/>(collection-content)
    participant H as useCollectionQuery<br/>(useQuery)
    participant Q as fetchCollection
    participant P as parseResponse
    participant R as GET /api/user/collection<br/>(withAuth)
    participant RP as PurchaseRepository.findAllByUser
    participant DB as Prisma · MongoDB
    participant V as collectionResponseSchema
    participant RC as QueryCache.onError
    C->>H: useCollectionQuery()
    H->>Q: queryFn({signal})
    Q->>R: fetch('/api/user/collection', {signal})
    alt 401 unauthenticated
        R-->>Q: 401 (withAuth)
        Q-->>H: throw Error('Unauthorized')
    else 200 ok
        R->>RP: findAllByUser(userId)
        RP->>DB: purchases + release + images + artists + formats + downloads
        DB-->>RP: rows
        RP-->>R: purchases
        R-->>Q: 200 { purchases, count, isAdmin }
        Q->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: data
            H-->>C: { data }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else other error
        R-->>Q: 500
        Q-->>H: throw Error('Failed to fetch collection')
    end`,
  },
  {
    file: '19-use-tours-query.mmd',
    title: '19. useInfiniteToursQuery — paginated public tours (infinite)',
    src: `%% useInfiniteToursQuery — paginated public tours listing (infinite scroll)
sequenceDiagram
    autonumber
    actor U as Visitor
    participant C as Component<br/>(tours-content / home-content)
    participant H as useInfiniteToursQuery<br/>(useInfiniteQuery, keepPreviousData)
    participant F as fetchAndParse
    participant R as GET /api/tours<br/>(withRateLimit: publicLimiter)
    participant RP as TourRepository.findAll
    participant DB as Prisma (tour.findMany)
    participant V as paginatedResponseSchema<br/>(tourWithRelationsSchema)
    participant RC as QueryCache.onError
    C->>H: useInfiniteToursQuery(search)
    H->>F: queryFn({pageParam=skip, signal})
    F->>R: fetch(/api/tours?skip&take=24&search, {signal})
    R->>RP: findAll({skip, take, search})
    RP->>DB: findMany(buildSearchWhere, include tourDates/venue/headliners/images)
    DB-->>RP: rows
    RP-->>R: TourWithRelations[]
    R-->>F: 200 { rows, nextSkip } (no-store)
    F->>V: safeParse(body)
    alt valid
        V-->>F: parsed page
        F-->>H: { rows, nextSkip } (getNextPageParam → nextSkip)
        H-->>C: { data.pages, fetchNextPage }
    else contract drift
        V-->>F: error
        F-->>H: throw ResponseValidationError
        H->>RC: reportResponseValidationError → POST /api/client-errors
    else response not ok
        R-->>F: 4xx/5xx (500 / 429 rate limit)
        F-->>H: throw Error('Failed to fetch tours')
    end`,
  },
  {
    file: '20-use-tour-query.mmd',
    title: '20. useTourQuery — single tour detail (404→null)',
    src: `%% useTourQuery — single tour detail (validated)
sequenceDiagram
    autonumber
    actor U as Visitor
    participant C as Component<br/>(tour-detail-content)
    participant H as useTourQuery<br/>(useQuery, enabled=!!tourId)
    participant FT as fetchTour
    participant P as parseResponse
    participant R as GET /api/tours/{tourId}<br/>(withRateLimit: publicLimiter)
    participant RP as TourRepository.findById
    participant DB as Prisma (tour.findUnique)
    participant V as tourWithRelationsSchema
    participant RC as QueryCache.onError
    C->>H: useTourQuery(tourId)
    H->>FT: queryFn({signal}) [gated on tourId]
    FT->>R: fetch(/api/tours/{tourId}, {signal})
    R->>R: OBJECT_ID_REGEX.test(tourId)
    alt invalid id
        R-->>FT: 400 Invalid tour ID
        FT-->>H: throw Error('Failed to fetch tour')
    else valid id
        R->>RP: findById(tourId)
        RP->>DB: findUnique({id}, include relations)
        DB-->>RP: tour | null
        RP-->>R: tour | null
        alt found
            R-->>FT: 200 { tour } (s-maxage=60, swr=300)
            FT->>P: parseResponse(url, schema, data.tour ?? data)
            P->>V: safeParse(body)
            alt valid
                V-->>P: parsed
                P-->>H: data
                H-->>C: { data }
            else contract drift
                V-->>P: error
                P-->>H: throw ResponseValidationError
                H->>RC: onError reports to /api/client-errors
            end
        else not found
            R-->>FT: 404 Tour not found
            FT-->>H: return null (no throw)
        else server error
            R-->>FT: 500
            FT-->>H: throw Error('Failed to fetch tour')
        end
    end`,
  },
  {
    file: '21-use-tour-dates-query.mmd',
    title: '21. useTourDatesQuery — dates for a tour (no-store)',
    src: `%% useTourDatesQuery — dates for a tour (loose schema, no-store)
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(admin tour-date-list)
    participant H as useTourDatesQuery<br/>(useQuery, enabled=!!tourId)
    participant F as fetchAndParse (cache:'no-store')
    participant R as GET /api/tours/{tourId}/dates<br/>(withRateLimit: publicLimiter)
    participant RP as TourDateRepository.findByTourId
    participant DB as Prisma (tourDate.findMany)
    participant V as tourDatesResponseSchema<br/>z.object tourDates: array(record)
    participant RC as QueryCache.onError
    C->>H: useTourDatesQuery(tourId)
    H->>F: queryFn({signal}) [gated on tourId]
    F->>R: fetch(/api/tours/{tourId}/dates, {cache:'no-store', signal})
    R->>R: OBJECT_ID_REGEX.test(tourId)
    alt invalid id
        R-->>F: 200 { tourDates: [] }
    else valid id
        R->>RP: findByTourId(tourId)
        RP->>DB: findMany({tourId}, orderBy startDate, include)
        DB-->>RP: TourDate[]
        RP-->>R: tourDates
        R-->>F: 200 { tourDates } (s-maxage=60, swr=300)
    end
    F->>V: safeParse(body)
    alt valid
        V-->>F: parsed
        F-->>H: { tourDates }
        H-->>C: { data }
    else contract drift
        V-->>F: error
        F-->>H: throw ResponseValidationError
        H->>RC: report → POST /api/client-errors
    else response not ok
        R-->>F: 500
        F-->>H: throw Error('Failed to fetch tour dates')
    end`,
  },
  {
    file: '22-use-venue-search-query.mmd',
    title: '22. useVenueSearchQuery — admin venue typeahead',
    src: `%% useVenueSearchQuery — admin venue typeahead (validated)
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as VenueSelect<br/>(tour date form)
    participant H as useVenueSearchQuery<br/>(useQuery, keepPreviousData)
    participant F as fetchAndParse
    participant R as GET /api/venues?search<br/>(withRateLimit · publicLimiter)
    participant RP as VenueRepository.findAll / findRecent
    participant DB as Prisma (venue.findMany)
    participant V as z.object venues:<br/>venueSearchItemSchema[]
    participant RC as QueryCache.onError
    C->>H: useVenueSearchQuery(searchValue)
    H->>F: queryFn({signal})
    F->>R: fetch(url, {signal})
    alt search present
        R->>RP: findAll({search, limit: 50})
        RP->>DB: findMany(OR name/address/city contains, orderBy name asc)
    else no search
        R->>RP: findRecent(5)
        RP->>DB: findMany(orderBy createdAt desc, take 5)
    end
    DB-->>RP: venues
    RP-->>R: rows → map { id, name, city, state, timeZone }
    alt 200 OK
        R-->>F: 200 { venues }
        F->>V: safeParse(body)
        alt valid
            V-->>F: parsed
            F-->>H: data
            H-->>C: { data }
        else contract drift
            V-->>F: error
            F-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else non-ok (500)
        R-->>F: 5xx
        F-->>H: throw Error('Failed to fetch venues')
    end`,
  },
  {
    file: '23-use-venue-detail-query.mmd',
    title: '23. useVenueDetailQuery — single venue',
    src: `%% useVenueDetailQuery — single venue (edit dialog, validated)
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as VenueSelect<br/>(edit dialog)
    participant H as useVenueDetailQuery<br/>(useQuery, enabled !!venueId)
    participant F as fetchAndParse
    participant R as GET /api/venues/{venueId}<br/>(withRateLimit · publicLimiter)
    participant RP as VenueRepository.findById
    participant DB as Prisma (venue.findUnique)
    participant V as z.object venue:<br/>venueDetailSchema
    participant RC as QueryCache.onError
    C->>H: useVenueDetailQuery(editVenueId ?? '')
    H->>F: queryFn({signal})
    F->>R: fetch(/api/venues/{venueId}, {signal})
    R->>R: isValidObjectId(venueId) else 400
    R->>RP: findById(venueId)
    RP->>DB: findUnique({ where: { id } })
    DB-->>RP: venue | null
    alt found (200)
        RP-->>R: venue
        R-->>F: 200 { venue }
        F->>V: safeParse(body)
        alt valid
            V-->>F: parsed
            F-->>H: data
            H-->>C: { data }
        else contract drift
            V-->>F: error
            F-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else not found / invalid / error
        R-->>F: 404 / 400 / 500
        F-->>H: throw Error('Failed to fetch venue details')
    end`,
  },
  {
    file: '24-use-banners-query.mmd',
    title: '24. useBannersQuery — active notification banners (10-min staleTime)',
    src: `%% useBannersQuery — active notification banners
sequenceDiagram
    autonumber
    actor U as Visitor
    participant C as Component<br/>(home-content / banner carousel)
    participant H as useBannersQuery<br/>(useQuery, staleTime 10min)
    participant F as fetchAndParse
    participant R as GET /api/notification-banners<br/>(server-only, withRateLimit publicLimiter)
    participant SV as BannerNotificationService<br/>.getActiveBanners (withCache)
    participant DB as Prisma (bannerNotification.findMany)
    participant V as bannersApiResponseSchema
    participant RC as QueryCache.onError
    C->>H: useBannersQuery()
    H->>F: queryFn({signal})
    F->>R: fetch(/api/notification-banners, {signal})
    R->>SV: getActiveBanners()
    SV->>DB: withCache → findMany(orderBy slotNumber) + getRotationInterval
    DB-->>SV: notifications
    SV->>SV: activation window + HTML sanitize
    alt service success
        SV-->>R: { success:true, data }
        R-->>F: 200 { banners[], rotationInterval } (s-maxage=60,swr=300)
        F->>V: safeParse(body)
        alt valid
            V-->>F: parsed
            F-->>H: { banners, rotationInterval }
            H-->>C: { data }
        else contract drift
            V-->>F: error
            F-->>H: throw ResponseValidationError
            H->>RC: report → POST /api/client-errors
        end
    else service failure
        SV-->>R: { success:false, error }
        R-->>F: 500
        F-->>H: throw Error('Failed to fetch banners')
    end`,
  },
  {
    file: '25-use-notification-banner-search-query.mmd',
    title: '25. useNotificationBannerSearchQuery — admin banner search',
    src: `%% useNotificationBannerSearchQuery — admin banner search
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(admin notification-search)
    participant H as useNotificationBannerSearchQuery<br/>(useQuery, keepPreviousData)
    participant F as fetchAndParse
    participant R as GET /api/notification-banners/search<br/>(server-only, withAdmin)
    participant SV as BannerNotificationService<br/>.searchNotifications
    participant DB as Prisma (bannerNotification.findMany)
    participant V as notificationBannerSearchResponseSchema
    participant RC as QueryCache.onError
    C->>H: useNotificationBannerSearchQuery(query)
    H->>F: queryFn({signal})
    F->>R: fetch(/api/notification-banners/search?q&take=20, {signal})
    R->>R: withAdmin (session + admin role)
    alt not admin
        R-->>F: 401/403
        F-->>H: throw Error('Failed to search notification banners')
    else admin
        R->>SV: searchNotifications(q, take)
        SV->>DB: findMany(content contains q, select, createdAt desc, take)
        DB-->>SV: notifications
        alt success
            SV-->>R: { success:true, data }
            R-->>F: 200 { notifications }
            F->>V: safeParse(body)
            alt valid
                V-->>F: parsed
                F-->>H: { notifications }
                H-->>C: { data }
            else contract drift
                V-->>F: error
                F-->>H: throw ResponseValidationError
                H->>RC: report → POST /api/client-errors
            end
        else service failure
            SV-->>R: { success:false }
            R-->>F: 500
            F-->>H: throw Error('Failed to search notification banners')
        end
    end`,
  },
  {
    file: '26-use-cdn-status-query.mmd',
    title: '26. useCdnStatusQuery — CloudFront invalidation status (polled)',
    src: `%% useCdnStatusQuery — CloudFront invalidation status (polled, no-store)
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(cdn-status-banner)
    participant H as useCdnStatusQuery<br/>(useQuery, refetchInterval while invalidating)
    participant F as fetchAndParse (cache:'no-store')
    participant R as GET /api/cdn-status<br/>(withAdmin)
    participant CF as CloudFrontClient.ListInvalidations
    participant V as cdnStatusSchema
    participant RC as QueryCache.onError
    C->>H: useCdnStatusQuery()
    H->>F: queryFn({signal})
    F->>R: fetch(/api/cdn-status, {cache:'no-store', signal})
    R->>R: withAdmin (session + admin role)
    alt not configured
        R-->>F: 200 { status:'unknown', message:'CDN not configured' }
    else configured
        R->>CF: send(ListInvalidationsCommand, MaxItems:5)
        CF-->>R: InvalidationList
        R->>R: derive invalidating / ready (+est. minutes)
        R-->>F: 200 { status, message }
    end
    F->>V: safeParse(body)
    alt valid
        V-->>F: parsed
        F-->>H: data (poll every 30s while invalidating, else stop)
        H-->>C: { data }
    else contract drift
        V-->>F: error
        F-->>H: throw ResponseValidationError
        H->>RC: report → POST /api/client-errors
    else response not ok
        R-->>F: 401/403 (non-admin) or 500
        F-->>H: throw Error('Failed to fetch CDN status')
    end`,
  },
  {
    file: '27-use-health-status-query.mmd',
    title: '27. useHealthStatusQuery — DB health (aggressive retry)',
    src: `%% useHealthStatusQuery — DB health (validated, 5s timeout, retry:10)
sequenceDiagram
    autonumber
    actor U as User
    participant C as Component<br/>(data-store-health-status)
    participant H as useHealthStatusQuery<br/>(useQuery, retry:10, gcTime/staleTime:0)
    participant FH as fetchHealthStatus<br/>(fetch + 5s AbortController)
    participant P as parseResponse
    participant R as GET /api/health<br/>(withRateLimit: healthLimiter)
    participant DBU as checkDatabaseHealth
    participant DB as Prisma ($runCommandRaw ping)
    participant V as healthStatusSchema
    participant RC as QueryCache.onError
    C->>H: useHealthStatusQuery()
    H->>FH: queryFn({signal})
    FH->>FH: AbortSignal.any([signal, 5s timeout])
    FH->>R: fetch(getApiBaseUrl()+/api/health, {cache:'no-store', no-cache, signal})
    R->>DBU: checkDatabaseHealth()
    DBU->>DB: $runCommandRaw({ping:1})
    alt db healthy
        DB-->>DBU: ok (+latency)
        DBU-->>R: { healthy:true, latency }
        R-->>FH: 200 { status:'healthy', database:'connected', latency } (no-store)
        FH->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: data
            H-->>C: { data }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else db unhealthy
        DB-->>DBU: error
        DBU-->>R: { healthy:false, error }
        R-->>FH: 500 { status:'unhealthy', database:'connection failed' }
        FH->>FH: parse body → errorData.database
        FH-->>H: throw Error(errorData.database ?? 'Failed to fetch health status')
        H->>H: retry up to 10x (500ms x3, then exponential backoff)
    end`,
  },
  {
    file: '28-use-chat-me-query.mmd',
    title: '28. useChatMeQuery — viewer chat-permission gate',
    src: `%% useChatMeQuery — viewer chat-permission gate (validated, no-store, focus-refetch)
sequenceDiagram
    autonumber
    actor U as User
    participant C as ChatBody<br/>(chat drawer)
    participant H as useChatMeQuery<br/>(useQuery, staleTime 60s)
    participant Q as fetchMe queryFn
    participant P as parseResponse
    participant R as GET /api/chat/me<br/>(withAuth, force-dynamic)
    participant CUR as ChatUserRepository
    participant BES as BanEvasionService
    participant DB as Prisma · MongoDB
    participant V as chatMeResponseSchema
    participant RC as QueryCache.onError
    C->>H: useChatMeQuery({ enabled })
    H->>Q: fetchMe({ signal })
    Q->>R: fetch('/api/chat/me', {cache:'no-store', signal})
    alt not authenticated
        R-->>Q: 401 Authentication required
        Q-->>H: throw Error('Failed to load chat status')
    else authenticated
        R->>CUR: findByUserId(userId)
        R->>BES: check({userId,email,ua,lang,ip})
        CUR->>DB: prisma.chatUser.findUnique
        BES->>DB: bannedIdentity lookup
        DB-->>R: chatUser?, ban
        R-->>Q: 200 { blocked: chatUser.disabled OR ban.banned }
        Q->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: { blocked }
            H-->>C: { data: meStatus }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    end`,
  },
  {
    file: '29-use-chat-messages-query.mmd',
    title: '29. useInfiniteChatMessagesQuery — paged chat history',
    src: `%% useInfiniteChatMessagesQuery — paged chat history (infinite, validated, no-store)
sequenceDiagram
    autonumber
    actor U as User
    participant C as ChatBody<br/>(chat drawer)
    participant H as useInfiniteChatMessagesQuery<br/>(useInfiniteQuery)
    participant Q as fetchPage queryFn
    participant P as parseResponse
    participant R as GET /api/chat/messages<br/>(withAuth, force-dynamic)
    participant SV as ChatService.listRecent
    participant SR as ChatMessageRepository.findRecent
    participant DB as Prisma · MongoDB
    participant V as chatMessagesPageSchema<br/>(chatMessageDtoSchema[])
    participant RC as QueryCache.onError
    C->>H: useInfiniteChatMessagesQuery({ enabled })
    H->>Q: fetchPage({ pageParam cursor, signal })
    Q->>R: fetch('/api/chat/messages?limit=20&cursor', {cache:'no-store', signal})
    alt bad cursorCreatedAt
        R-->>Q: 400 Invalid cursorCreatedAt
        Q-->>H: throw Error('Failed to load chat messages')
    else ok
        R->>SV: listRecent({ limit, cursor })
        SV->>SR: findRecent({ limit, cursor })
        SR->>DB: findMany(exclude hidden + disabled/banned authors, createdAt desc, id tiebreak)
        DB-->>SR: rows
        SR-->>SV: rows
        SV->>SV: reverse() + toDto (gravatarHash, reactions)
        SV-->>R: ChatMessageDto[]
        R-->>Q: 200 { messages }
        Q->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: { messages }
            H->>H: getNextPageParam → older cursor · flatten · cap 200
            H-->>C: { messages, hasNextPage, fetchNextPage }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    end`,
  },
  {
    file: '30-use-chat-pinned-messages-query.mmd',
    title: '30. useChatPinnedMessagesQuery — pinned announcements',
    src: `%% useChatPinnedMessagesQuery — pinned announcements strip (validated, no-store)
sequenceDiagram
    autonumber
    actor U as User
    participant C as ChatBody<br/>(chat drawer)
    participant H as useChatPinnedMessagesQuery<br/>(useQuery, staleTime 30s)
    participant Q as fetchPinned queryFn
    participant P as parseResponse
    participant R as GET /api/chat/pinned<br/>(withAuth, force-dynamic)
    participant SV as ChatService.listPinned
    participant SR as ChatMessageRepository.findPinned
    participant DB as Prisma · MongoDB
    participant V as pinnedResponseSchema<br/>(chatMessageDtoSchema[])
    participant RC as QueryCache.onError
    C->>H: useChatPinnedMessagesQuery({ enabled })
    H->>Q: fetchPinned({ signal })
    Q->>R: fetch('/api/chat/pinned', {cache:'no-store', signal})
    alt not authenticated
        R-->>Q: 401 Authentication required
        Q-->>H: throw Error('Failed to load pinned messages')
    else ok
        R->>SV: listPinned()
        SV->>SR: findPinned()
        SR->>DB: findMany(pinnedAt not null, not hidden, pinnedAt desc)
        DB-->>SR: rows
        SR-->>SV: rows → toDto
        SV-->>R: ChatMessageDto[]
        R-->>Q: 200 { messages }
        Q->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: messages
            H-->>C: { data: pinnedMessages }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    end`,
  },
  {
    file: '31-use-mention-search-query.mmd',
    title: '31. useMentionSearchQuery — chat @-mention autocomplete',
    src: `%% useMentionSearchQuery — chat @-mention autocomplete (inline queryFn, validated)
sequenceDiagram
    autonumber
    actor U as User
    participant C as ChatMentionAutocomplete<br/>(useDebounce 200ms)
    participant H as useMentionSearchQuery<br/>(useQuery, enabled trimmed.length>0)
    participant P as parseResponse
    participant R as GET /api/chat/mention-search?q<br/>(withAuth, server-only, no-store)
    participant SV as ChatMentionService.searchByPrefix
    participant DB as Prisma (user.findMany)
    participant V as mentionSearchResponseSchema
    participant RC as QueryCache.onError
    C->>H: useMentionSearchQuery(debouncedQuery)
    H->>H: trimmed = prefix.trim().slice(0,32)
    H->>R: fetch(url, {signal, cache:'no-store'})
    R->>R: withAuth → require session
    alt authenticated
        R->>SV: searchByPrefix(q, session.user.id)
        SV->>DB: findMany(username startsWith q, NOT self, take SEARCH_LIMIT, orderBy username)
        DB-->>SV: rows (filter null usernames)
        SV-->>R: matches
        R-->>H: 200 { matches }
        H->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: data.matches
            H-->>C: { data: MentionMatch[] }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    else unauthenticated / non-ok
        R-->>H: 401/4xx/5xx
        H-->>C: throw Error('Mention search failed')
    end`,
  },
  {
    file: '32-use-chat-admin-users-query.mmd',
    title: '32. useChatAdminUsersQuery — admin chat-users table',
    src: `%% useChatAdminUsersQuery — admin chat-users table (paginated, validated, no-store)
sequenceDiagram
    autonumber
    actor A as Admin
    participant C as ChatUsersTable<br/>(admin/chat)
    participant H as useChatAdminUsersQuery<br/>(useQuery)
    participant Q as fetchPage queryFn
    participant P as parseResponse
    participant R as GET /api/admin/chat/users<br/>(withAdmin, force-dynamic)
    participant SV as ChatAdminService.listChatUsers
    participant SR as ChatUserRepository
    participant DB as Prisma · MongoDB
    participant V as listChatUsersResultSchema
    participant RC as QueryCache.onError
    C->>H: useChatAdminUsersQuery({page,perPage,sortBy,sortDirection})
    H->>Q: fetchPage(params, signal)
    Q->>R: fetch('/api/admin/chat/users?page&perPage&sortBy&sortDirection', {cache:'no-store', signal})
    alt not authenticated / not admin
        R-->>Q: 401 / 403
        Q-->>H: throw Error('Failed to load chat users')
    else admin ok
        R->>SV: listChatUsers({page,perPage,sortBy,sortDirection})
        SV->>SR: findManyPaginated(skip,take,sortBy,dir) + count()
        SR->>DB: findMany(include user) + count()
        DB-->>SR: rows, total
        SR-->>SV: rows, total → map ChatUserAdminDto[]
        SV-->>R: { rows, total, page, perPage }
        R-->>Q: 200 ListChatUsersResult
        Q->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: result
            H-->>C: { data }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    end`,
  },
  {
    file: '33-use-admin-user-messages-query.mmd',
    title: '33. useInfiniteAdminUserMessagesQuery — per-user message history',
    src: `%% useInfiniteAdminUserMessagesQuery — per-user message history (infinite, validated, no-store)
sequenceDiagram
    autonumber
    actor A as Admin
    participant C as UserDetailView<br/>(admin/chat/users/{userId})
    participant H as useInfiniteAdminUserMessagesQuery<br/>(useInfiniteQuery)
    participant Q as fetchPage queryFn
    participant P as parseResponse
    participant R as GET /api/admin/chat/users/{userId}/messages<br/>(withAdmin, force-dynamic)
    participant SV as ChatAdminService.listUserMessages
    participant SR as ChatMessageRepository.findByUserIdForAdmin
    participant DB as Prisma · MongoDB
    participant V as adminUserMessagesResponseSchema
    participant RC as QueryCache.onError
    C->>H: useInfiniteAdminUserMessagesQuery(userId)
    H->>Q: fetchPage({ userId, skip=pageParam, signal })
    Q->>R: fetch('.../messages?skip&take=25', {cache:'no-store', signal})
    alt not authenticated / not admin
        R-->>Q: 401 / 403
        Q-->>H: throw Error('Failed to load user messages')
    else admin ok
        R->>SV: listUserMessages({userId,skip,take})
        SV->>SR: findByUserIdForAdmin({userId,skip,take})
        SR->>DB: findMany(where userId, createdAt desc, includes hidden)
        DB-->>SR: rows
        SR-->>SV: rows
        SV-->>R: rows
        R->>R: map AdminUserMessageDto[] · nextSkip = full-page ? skip+take : null
        R-->>Q: 200 { rows, nextSkip }
        Q->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: page (getNextPageParam → nextSkip)
            H-->>C: { data.pages, fetchNextPage }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    end`,
  },
  {
    file: '34-use-reported-users-query.mmd',
    title: '34. useInfiniteReportedUsersQuery — admin reported-users list',
    src: `%% useInfiniteReportedUsersQuery — admin reported-users list (infinite, validated, no-store)
sequenceDiagram
    autonumber
    actor A as Admin
    participant C as ReportedUsersTable<br/>(admin/chat)
    participant H as useInfiniteReportedUsersQuery<br/>(useInfiniteQuery, keepPreviousData)
    participant Q as fetchReportedUsersPage queryFn
    participant P as parseResponse
    participant R as GET /api/admin/chat/reported-users<br/>(withAdmin, force-dynamic)
    participant SV as ChatAdminService.listReportedUsers
    participant AR as AbuseReportRepository.listReportedUsers
    participant DB as Prisma · MongoDB
    participant V as paginatedResponseSchema<br/>(reportedUserDtoSchema)
    participant RC as QueryCache.onError
    C->>H: useInfiniteReportedUsersQuery({ windowDays, search })
    H->>Q: fetchReportedUsersPage(params, skip=pageParam, signal)
    Q->>R: fetch('.../reported-users?skip&take=24&windowDays&search', {cache:'no-store', signal})
    alt not authenticated / not admin
        R-->>Q: 401 / 403
        Q-->>H: throw Error('Failed to load reported users')
    else admin ok
        R->>SV: listReportedUsers({windowDays,search,skip,take})
        SV->>AR: listReportedUsers({ windowDays })
        AR->>DB: abuseReport.groupBy(reportedUserId, _count, _max createdAt) + user.findMany
        DB-->>AR: grouped + users
        AR-->>SV: ReportedUserSummary[] (global, sorted)
        SV->>SV: in-memory search filter + skip/take slice → nextSkip
        SV-->>R: { rows, nextSkip }
        R->>R: map ReportedUserDto[] (no reporter identity)
        R-->>Q: 200 { rows, nextSkip }
        Q->>P: parseResponse(url, schema, body)
        P->>V: safeParse(body)
        alt valid
            V-->>P: parsed
            P-->>H: page (getNextPageParam → nextSkip, keepPreviousData)
            H-->>C: { data.pages, fetchNextPage }
        else contract drift
            V-->>P: error
            P-->>H: throw ResponseValidationError
            H->>RC: onError reports to /api/client-errors
        end
    end`,
  },
];

// 1) Write each diagram to diagrams/<file>.
for (const { file, src } of DIAGRAMS) {
  writeFileSync(join(diagramsDir, file), `${src}\n`, 'utf8');
}
console.info(`Wrote ${DIAGRAMS.length} .mmd diagrams to diagrams/`);

// 2) Assemble the HTML (one diagram per landscape page; Mermaid from CDN).
const titleByFile = Object.fromEntries(DIAGRAMS.map((d) => [d.file, d.title]));
const files = readdirSync(diagramsDir)
  .filter((f) => f.endsWith('.mmd'))
  .sort();

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pages = files
  .map((f) => {
    const src = readFileSync(join(diagramsDir, f), 'utf8');
    const title = titleByFile[f] ?? f;
    return `<section class="page">
      <h2>${esc(title)}</h2>
      <div class="diagram"><pre class="mermaid">${esc(src)}</pre></div>
    </section>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>boudreaux — Query Hook Sequence Diagrams</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<style>
  @page { size: 11.69in 8.27in; margin: 0.35in; } /* A4 landscape */
  html, body { margin: 0; padding: 0; background: #fff; color: #000;
    font-family: Helvetica, Arial, sans-serif; }
  .page { box-sizing: border-box; width: 100%; height: 7.4in;
    page-break-after: always; display: flex; flex-direction: column; align-items: center; }
  .page:last-of-type { page-break-after: auto; }
  h2 { font-size: 18px; font-weight: 700; margin: 0 0 8px 0;
    border-bottom: 2px solid #000; width: 100%; padding-bottom: 6px; }
  .diagram { flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .mermaid { width: 100%; display: flex; justify-content: center; }
  .mermaid svg { max-width: 100% !important; max-height: 6.8in !important; height: auto !important; }
</style>
</head>
<body>
${pages}
<script>
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    themeVariables: {
      background: '#ffffff', primaryColor: '#ffffff', primaryBorderColor: '#000000',
      primaryTextColor: '#000000', secondaryColor: '#e6e6e6', tertiaryColor: '#f0f0f0',
      lineColor: '#000000', textColor: '#000000', fontFamily: 'Helvetica, Arial, sans-serif',
      fontSize: '15px', actorBkg: '#ffffff', actorBorder: '#000000', actorTextColor: '#000000',
      signalColor: '#000000', signalTextColor: '#000000',
      labelBoxBkgColor: '#e6e6e6', labelBoxBorderColor: '#000000', labelTextColor: '#000000',
      loopTextColor: '#000000', noteBkgColor: '#e6e6e6', noteTextColor: '#000000', noteBorderColor: '#000000',
      activationBkgColor: '#cccccc', activationBorderColor: '#000000', sequenceNumberColor: '#ffffff',
      altBackground: '#f7f7f7'
    },
    sequence: { useMaxWidth: true, wrap: true, mirrorActors: false, boxMargin: 8 }
  });
  // Render each diagram explicitly (deterministic; mermaid.run() proved unreliable
  // with the vendored bundle). Inject the SVG in place of the <pre> source.
  (async () => {
    const nodes = [...document.querySelectorAll('.mermaid')];
    for (let i = 0; i < nodes.length; i++) {
      try {
        const { svg } = await mermaid.render('seq-' + i, nodes[i].textContent);
        nodes[i].innerHTML = svg;
      } catch (e) {
        nodes[i].innerHTML = '<pre style="color:#b00">Render error: ' + String(e) + '</pre>';
      }
    }
    document.title = 'READY';
  })();
</script>
</body>
</html>`;

const htmlPath = join(here, 'query-hook-sequences.html');
writeFileSync(htmlPath, html);
console.info('Wrote query-hook-sequences.html');

// 3) Print to PDF via headless Chromium (Playwright, already installed).
const pdfPath = join(here, 'query-hook-sequences.pdf');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const expected = DIAGRAMS.length;
  await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
  // Wait until every diagram has actually produced an <svg> (deterministic with
  // the vendored Mermaid — no CDN race). Fails loudly instead of printing blanks.
  await page.waitForFunction(
    (n) => document.querySelectorAll('.mermaid svg').length === n,
    expected,
    { timeout: 60_000 }
  );
  const rendered = await page.$$eval('.mermaid svg', (s) => s.length);
  const mermaidErrors = await page.$$eval('.mermaid', (nodes) =>
    nodes.map((n, i) => (/syntax error/i.test(n.textContent) ? i + 1 : 0)).filter(Boolean)
  );
  if (errors.length) console.warn('Page errors:', errors.join(' | '));
  if (mermaidErrors.length || rendered !== expected) {
    throw new Error(
      `Render check failed: ${rendered}/${expected} SVGs; errors on page(s) ${mermaidErrors.join(', ') || 'none'}`
    );
  }
  console.info(`All ${rendered} diagrams rendered cleanly`);
  await page.pdf({
    path: pdfPath,
    printBackground: true,
    landscape: true,
    format: 'A4',
    margin: { top: '0.35in', bottom: '0.35in', left: '0.35in', right: '0.35in' },
  });
  console.info('Wrote query-hook-sequences.pdf');
} finally {
  await browser.close();
}
