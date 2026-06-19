/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Generate one UML sequence diagram per TanStack Query *mutation* hook
// (src/app/hooks/mutations/), then print a landscape, grayscale PDF — the
// write-side companion to ../query-hook-sequences. Writes each diagram to
// diagrams/*.mmd, assembles an HTML page (Mermaid from CDN), and prints to PDF
// with headless Chromium via Playwright. No new npm dependencies.
//
//   node build.mjs            # diagrams/*.mmd -> *.html -> mutation-hook-sequences.pdf
//
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const diagramsDir = join(here, 'diagrams');
mkdirSync(diagramsDir, { recursive: true });

/**
 * One diagram per mutation hook. `file` becomes diagrams/<file>; `title` is the
 * page heading; `src` is the Mermaid sequenceDiagram source. Ordered by domain.
 *
 * Every diagram traces the same write-side spine: component → useXMutation
 * (useMutation) → mutationFn → Server Action ('use server') → auth guard →
 * service/repository → Prisma · MongoDB → server cache revalidation
 * (revalidatePath / in-memory cache) → the action's FormState (or
 * {success,error}) result → onSuccess → queryClient.invalidateQueries(keys) →
 * back to the component. Two result contracts recur:
 *
 *  - FormState actions (create/update/upsert): resolve with { success, errors,
 *    data } even on validation failure, so onSuccess fires but the
 *    `result.success` guard skips invalidation; only requireRole throwing
 *    rejects the mutation into onError.
 *  - {success,error} actions (delete/headliner/publish/cover-art/rotation):
 *    catch auth internally and resolve with { success:false }, so they never
 *    reject — the guard still gates invalidation on success.
 */
const DIAGRAMS = [
  // ── Releases ────────────────────────────────────────────────────────────
  {
    file: '01-use-create-release-mutation.mmd',
    title: '1. useCreateReleaseMutation — create a release',
    src: `%% useCreateReleaseMutation — create a release
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(release-form)
    participant H as useCreateReleaseMutation<br/>(useMutation)
    participant A as createReleaseAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as ReleaseService<br/>.createRelease
    participant DB as Prisma · MongoDB<br/>(release.create)
    participant NC as next/cache + ReleaseService<br/>.invalidateCache
    participant QC as QueryClient
    U->>C: submit new release
    C->>H: mutateAsync({formState, formData})
    H->>A: mutationFn(formState, formData)
    A->>RR: requireRole('admin')
    alt not admin
        RR-->>A: throw
        A-->>H: promise rejects
        H-->>C: onError (no invalidation)
    else admin
        A->>SV: createRelease(data)
        SV->>DB: release.create (+ artistRelease.createMany)
        DB-->>SV: release
        SV-->>A: { success, data }
        alt success
            A->>NC: revalidatePath('/releases','/artists/[slug]') + invalidateCache()
            A-->>H: FormState { success:true, data:{releaseId} }
            H->>QC: onSuccess → invalidateQueries(releases.all), (artists.all)
            H-->>C: FormState → toast + redirect
        else service/validation failure
            A-->>H: FormState { success:false, errors }
            H-->>C: onSuccess no-op (guard) → render field errors
        end
    end`,
  },
  {
    file: '02-use-update-release-mutation.mmd',
    title: '2. useUpdateReleaseMutation — update a release',
    src: `%% useUpdateReleaseMutation — update a release
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(release-form)
    participant H as useUpdateReleaseMutation<br/>(useMutation)
    participant A as updateReleaseAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as ReleaseService<br/>.updateRelease
    participant DB as Prisma · MongoDB<br/>(release.update)
    participant NC as next/cache + ReleaseService<br/>.invalidateCache
    participant QC as QueryClient
    C->>H: mutateAsync({releaseId, formState, formData})
    H->>A: mutationFn(releaseId, formState, formData)
    A->>RR: requireRole('admin')
    alt not admin
        RR-->>A: throw
        A-->>H: rejects → onError
    else admin
        A->>SV: updateRelease(releaseId, data)
        SV->>DB: release.update (+ sync artistReleases)
        DB-->>SV: release
        SV-->>A: { success }
        alt success
            A->>NC: revalidatePath('/releases','/releases/{id}','/artists/[slug]') + invalidateCache()
            A-->>H: FormState { success:true }
            H->>QC: onSuccess → invalidateQueries(releases.all), (artists.all)
            H-->>C: FormState → toast, then image uploads
        else failure
            A-->>H: FormState { success:false, errors }
            H-->>C: onSuccess no-op → field errors
        end
    end`,
  },
  {
    file: '03-use-update-release-cover-art-mutation.mmd',
    title: '3. useUpdateReleaseCoverArtMutation — persist cover art (edit mode)',
    src: `%% useUpdateReleaseCoverArtMutation — persist cover art immediately
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(release-form · CoverArtField)
    participant H as useUpdateReleaseCoverArtMutation<br/>(useMutation)
    participant A as updateReleaseCoverArtAction<br/>('use server')
    participant RR as requireRole('admin')
    participant DB as Prisma · MongoDB<br/>(release.update coverArt)
    participant NC as next/cache
    participant QC as QueryClient
    U->>C: upload cover art (S3 + variants done)
    C->>H: mutateAsync({releaseId, coverArt})
    H->>A: mutationFn(releaseId, coverArt)
    A->>RR: requireRole('admin')
    alt not admin
        RR-->>A: throw
        A-->>H: rejects → onError
    else admin
        A->>DB: release.update({ coverArt })
        DB-->>A: ok
        alt success
            A->>NC: revalidatePath('/','/releases/{id}')
            A-->>H: { success:true }
            H->>QC: onSuccess → invalidateQueries(releases.all), (artists.all)
            H-->>C: success
        else failure
            A-->>H: { success:false, error }
            H-->>C: onSuccess no-op → throw (CoverArtField surfaces error)
        end
    end`,
  },
  // ── Artists ─────────────────────────────────────────────────────────────
  {
    file: '04-use-create-artist-mutation.mmd',
    title: '4. useCreateArtistMutation — create an artist',
    src: `%% useCreateArtistMutation — create an artist
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(artist-form)
    participant H as useCreateArtistMutation<br/>(useMutation)
    participant A as createArtistAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as ArtistService<br/>.createArtist
    participant DB as Prisma · MongoDB<br/>(artist.create)
    participant NC as next/cache
    participant QC as QueryClient
    C->>H: mutateAsync({formState, formData})
    H->>A: mutationFn(formState, formData)
    A->>RR: requireRole('admin')
    alt not admin
        RR-->>A: throw
        A-->>H: rejects → onError
    else admin
        A->>SV: createArtist(data)
        SV->>DB: artist.create
        DB-->>SV: artist
        SV-->>A: { success, data }
        alt success
            A->>NC: revalidatePath('/admin/artist/new')
            A-->>H: FormState { success:true, data:{artistId} }
            H->>QC: onSuccess → invalidateQueries(artists.all), (releases.all)
            H-->>C: FormState → toast, then image uploads
        else failure
            A-->>H: FormState { success:false, errors }
            H-->>C: onSuccess no-op → field errors
        end
    end`,
  },
  {
    file: '05-use-update-artist-mutation.mmd',
    title: '5. useUpdateArtistMutation — update an artist',
    src: `%% useUpdateArtistMutation — update an artist
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(artist-form)
    participant H as useUpdateArtistMutation<br/>(useMutation)
    participant A as updateArtistAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as ArtistService<br/>.updateArtist
    participant DB as Prisma · MongoDB<br/>(artist.update)
    participant NC as next/cache + ReleaseService<br/>.invalidateCache
    participant QC as QueryClient
    C->>H: mutateAsync({artistId, formState, formData})
    H->>A: mutationFn(artistId, formState, formData)
    A->>RR: requireRole('admin')
    alt not admin
        RR-->>A: throw
        A-->>H: rejects → onError
    else admin
        A->>SV: updateArtist(artistId, data)
        SV->>DB: artist.update
        DB-->>SV: artist
        SV-->>A: { success }
        alt success
            A->>NC: revalidatePath('/admin/artists','/artists/{slug}','/releases') + invalidateCache()
            A-->>H: FormState { success:true }
            H->>QC: onSuccess → invalidateQueries(artists.all), (releases.all)
            H-->>C: FormState → toast, then image uploads
        else failure
            A-->>H: FormState { success:false, errors }
            H-->>C: onSuccess no-op → field errors
        end
    end`,
  },
  // ── Tours ───────────────────────────────────────────────────────────────
  {
    file: '06-use-create-tour-mutation.mmd',
    title: '6. useCreateTourMutation — create a tour',
    src: `%% useCreateTourMutation — create a tour
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(tour-form)
    participant H as useCreateTourMutation<br/>(useMutation)
    participant A as createTourAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as TourService.create
    participant DB as Prisma · MongoDB<br/>(tour.create)
    participant NC as next/cache
    participant QC as QueryClient
    C->>H: mutateAsync({formState, formData})
    H->>A: mutationFn(formState, formData)
    A->>RR: requireRole('admin')
    alt not admin
        RR-->>A: throw
        A-->>H: rejects → onError
    else admin
        A->>SV: create(data)
        SV->>DB: tour.create
        DB-->>SV: tour
        SV-->>A: tour
        alt success
            A->>NC: revalidatePath('/admin/tours','/tours')
            A-->>H: FormState { success:true, data:{tourId} }
            H->>QC: onSuccess → invalidateQueries(tours.all)
            H-->>C: FormState → toast + redirect
        else failure
            A-->>H: FormState { success:false, errors }
            H-->>C: onSuccess no-op → field errors
        end
    end`,
  },
  {
    file: '07-use-update-tour-mutation.mmd',
    title: '7. useUpdateTourMutation — update a tour',
    src: `%% useUpdateTourMutation — update a tour
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(tour-form)
    participant H as useUpdateTourMutation<br/>(useMutation)
    participant A as updateTourAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as TourService.update
    participant DB as Prisma · MongoDB<br/>(tour.update)
    participant NC as next/cache
    participant QC as QueryClient
    C->>H: mutateAsync({tourId, formState, formData})
    H->>A: mutationFn(tourId, formState, formData)
    A->>RR: requireRole('admin')
    alt not admin
        RR-->>A: throw
        A-->>H: rejects → onError
    else admin
        A->>SV: update(tourId, data)
        SV->>DB: tour.update
        DB-->>SV: tour
        SV-->>A: tour
        alt success
            A->>NC: revalidatePath('/admin/tours','/tours','/tours/{tourId}')
            A-->>H: FormState { success:true }
            H->>QC: onSuccess → invalidateQueries(tours.all)
            H-->>C: FormState → toast + redirect
        else failure
            A-->>H: FormState { success:false, errors }
            H-->>C: onSuccess no-op → field errors
        end
    end`,
  },
  {
    file: '08-use-delete-tour-mutation.mmd',
    title: '8. useDeleteTourMutation — delete a tour',
    src: `%% useDeleteTourMutation — delete a tour ({success,error} contract)
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(tour-form)
    participant H as useDeleteTourMutation<br/>(useMutation)
    participant A as deleteTourAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as TourService.delete
    participant DB as Prisma · MongoDB<br/>(tour.delete)
    participant NC as next/cache
    participant QC as QueryClient
    U->>C: confirm delete
    C->>H: mutateAsync({tourId})
    H->>A: mutationFn(tourId)
    A->>RR: requireRole('admin') — caught internally
    alt unauthorized or invalid id
        A-->>H: { success:false, error }
        H-->>C: onSuccess no-op → toast error
    else authorized
        A->>SV: delete(tourId)
        SV->>DB: tour.delete (+ cascade)
        DB-->>SV: ok
        SV-->>A: ok
        A->>NC: revalidatePath('/admin/tours','/tours')
        A-->>H: { success:true }
        H->>QC: onSuccess → invalidateQueries(tours.all)
        H-->>C: success → toast + redirect
    end`,
  },
  // ── Tour dates & headliners ─────────────────────────────────────────────
  {
    file: '09-use-create-tour-date-mutation.mmd',
    title: '9. useCreateTourDateMutation — add a tour date',
    src: `%% useCreateTourDateMutation — add a tour date
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(tour-date-form)
    participant H as useCreateTourDateMutation<br/>(useMutation)
    participant A as createTourDateAction<br/>('use server')
    participant RR as requireRole('admin')
    participant RP as TourDateRepository.create
    participant DB as Prisma · MongoDB<br/>(tourDate.create)
    participant NC as next/cache
    participant QC as QueryClient
    C->>H: mutateAsync({formState, formData})
    H->>A: mutationFn(formState, formData)
    A->>RR: requireRole('admin')
    alt not admin
        RR-->>A: throw
        A-->>H: rejects → onError
    else admin
        A->>RP: create(data + headlinerIds)
        RP->>DB: tourDate.create (+ headliners)
        DB-->>RP: tourDate
        RP-->>A: tourDate
        alt success
            A->>NC: revalidatePath('/admin/tours','/tours','/tours/[tourId]')
            A-->>H: FormState { success:true, data:{tourDateId} }
            H->>QC: onSuccess → invalidateQueries(tours.all)
            H-->>C: FormState → toast + close dialog
        else failure
            A-->>H: FormState { success:false, errors }
            H-->>C: onSuccess no-op → field errors
        end
    end`,
  },
  {
    file: '10-use-update-tour-date-mutation.mmd',
    title: '10. useUpdateTourDateMutation — edit a tour date',
    src: `%% useUpdateTourDateMutation — edit a tour date
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(tour-date-form)
    participant H as useUpdateTourDateMutation<br/>(useMutation)
    participant A as updateTourDateAction<br/>('use server')
    participant RR as requireRole('admin')
    participant RP as TourDateRepository.update
    participant DB as Prisma · MongoDB<br/>(tourDate.update)
    participant NC as next/cache
    participant QC as QueryClient
    C->>H: mutateAsync({tourDateId, formState, formData})
    H->>A: mutationFn(tourDateId, formState, formData)
    A->>RR: requireRole('admin')
    alt not admin
        RR-->>A: throw
        A-->>H: rejects → onError
    else admin
        A->>RP: update(tourDateId, data)
        RP->>DB: tourDate.update
        DB-->>RP: ok
        RP-->>A: ok
        alt success
            A->>NC: revalidatePath('/admin/tours','/tours','/tours/[tourId]')
            A-->>H: FormState { success:true }
            H->>QC: onSuccess → invalidateQueries(tours.all)
            H-->>C: FormState → toast + close dialog
        else failure
            A-->>H: FormState { success:false, errors }
            H-->>C: onSuccess no-op → field errors
        end
    end`,
  },
  {
    file: '11-use-delete-tour-date-mutation.mmd',
    title: '11. useDeleteTourDateMutation — delete a tour date',
    src: `%% useDeleteTourDateMutation — delete a tour date ({success,error})
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(tour-date-list)
    participant H as useDeleteTourDateMutation<br/>(useMutation)
    participant A as deleteTourDateAction<br/>('use server')
    participant RR as requireRole('admin')
    participant RP as TourDateRepository.delete
    participant DB as Prisma · MongoDB<br/>(tourDate.delete)
    participant NC as next/cache
    participant QC as QueryClient
    C->>H: mutateAsync({tourDateId})
    H->>A: mutationFn(tourDateId)
    A->>RR: requireRole('admin') — caught internally
    alt unauthorized or invalid id
        A-->>H: { success:false, error }
        H-->>C: onSuccess no-op → toast error
    else authorized
        A->>RP: delete(tourDateId)
        RP->>DB: tourDate.delete
        DB-->>RP: ok
        RP-->>A: ok
        A->>NC: revalidatePath('/admin/tours','/tours','/tours/[tourId]')
        A-->>H: { success:true }
        H->>QC: onSuccess → invalidateQueries(tours.all)
        H-->>C: success → toast
    end`,
  },
  {
    file: '12-use-update-headliner-set-time-mutation.mmd',
    title: '12. useUpdateHeadlinerSetTimeMutation — set a headliner set time',
    src: `%% useUpdateHeadlinerSetTimeMutation — set time, with tourDate/artist fallback
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(artist-pill-list)
    participant H as useUpdateHeadlinerSetTimeMutation<br/>(useMutation)
    participant A as updateHeadlinerSetTimeAction<br/>('use server')
    participant RR as requireRole('admin')
    participant RP as TourDateRepository<br/>.updateHeadlinerSetTime
    participant DB as Prisma · MongoDB
    participant NC as next/cache
    participant QC as QueryClient
    C->>H: mutateAsync({headlinerId, setTime, tourDateId?, artistId?})
    H->>A: mutationFn(headlinerId, setTime, tourDateId, artistId)
    A->>RR: requireRole('admin') — caught internally
    alt unauthorized / invalid id / bad time
        A-->>H: { success:false, error }
        H-->>C: onSuccess no-op → toast error
    else authorized
        A->>RP: updateHeadlinerSetTime(headlinerId, date)
        alt record not found (P2025) + ids present
            RP-->>A: throw P2025
            A->>RP: updateHeadlinerSetTimeByTourDateAndArtist(...)
            RP->>DB: update via (tourDate, artist)
            DB-->>RP: updated
        else direct hit
            RP->>DB: update by headlinerId
            DB-->>RP: ok
        end
        RP-->>A: ok
        A->>NC: revalidatePath('/admin/tours','/tours','/tours/[tourId]')
        A-->>H: { success:true }
        H->>QC: onSuccess → invalidateQueries(tours.all)
        H-->>C: success → toast + local state update
    end`,
  },
  {
    file: '13-use-remove-headliner-mutation.mmd',
    title: '13. useRemoveHeadlinerMutation — remove a headliner',
    src: `%% useRemoveHeadlinerMutation — remove headliner junction (artist preserved)
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(artist-pill-list)
    participant H as useRemoveHeadlinerMutation<br/>(useMutation)
    participant A as removeHeadlinerAction<br/>('use server')
    participant RR as requireRole('admin')
    participant RP as TourDateRepository<br/>.removeHeadliner
    participant DB as Prisma · MongoDB
    participant NC as next/cache
    participant QC as QueryClient
    C->>H: mutateAsync({headlinerId, tourDateId?, artistId?})
    H->>A: mutationFn(headlinerId, tourDateId, artistId)
    A->>RR: requireRole('admin') — caught internally
    alt unauthorized / invalid id
        A-->>H: { success:false, error }
        H-->>C: onSuccess no-op → toast error
    else authorized
        A->>RP: removeHeadliner(headlinerId)
        alt P2025 + ids present
            RP-->>A: throw P2025
            A->>RP: removeHeadlinerByTourDateAndArtist(...)
            RP->>DB: delete via (tourDate, artist)
            DB-->>RP: removed
        else direct hit
            RP->>DB: delete by headlinerId
            DB-->>RP: ok
        end
        RP-->>A: ok
        A->>NC: revalidatePath('/admin/tours','/tours','/tours/[tourId]')
        A-->>H: { success:true }
        H->>QC: onSuccess → invalidateQueries(tours.all)
        H-->>C: success → remove pill + onHeadlinersChange()
    end`,
  },
  {
    file: '14-use-reorder-headliners-mutation.mmd',
    title: '14. useReorderHeadlinersMutation — reorder headliners (drag end)',
    src: `%% useReorderHeadlinersMutation — persist new headliner order
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(artist-pill-list · dnd-kit)
    participant H as useReorderHeadlinersMutation<br/>(useMutation)
    participant A as reorderHeadlinersAction<br/>('use server')
    participant RR as requireRole('admin')
    participant RP as TourDateRepository<br/>.reorderHeadliners
    participant DB as Prisma · MongoDB
    participant NC as next/cache
    participant QC as QueryClient
    U->>C: drag-and-drop reorder (optimistic local order)
    C->>H: mutateAsync({tourDateId, headlinerIds})
    H->>A: mutationFn(tourDateId, headlinerIds)
    A->>RR: requireRole('admin') — caught internally
    alt unauthorized / invalid id in list
        A-->>H: { success:false, error }
        H-->>C: onSuccess no-op → revert order + toast error
    else authorized
        A->>RP: reorderHeadliners(tourDateId, ids)
        RP->>DB: update displayOrder per headliner
        DB-->>RP: ok
        RP-->>A: ok
        A->>NC: revalidatePath('/admin/tours','/tours','/tours/[tourId]')
        A-->>H: { success:true }
        H->>QC: onSuccess → invalidateQueries(tours.all)
        H-->>C: success → keep order + toast
    end`,
  },
  // ── Venues ──────────────────────────────────────────────────────────────
  {
    file: '15-use-create-venue-mutation.mmd',
    title: '15. useCreateVenueMutation — create a venue (inline)',
    src: `%% useCreateVenueMutation — inline venue creation from tour-date form
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(venue-select)
    participant H as useCreateVenueMutation<br/>(useMutation)
    participant A as createVenueAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as VenueService<br/>.checkDuplicateName + create
    participant DB as Prisma · MongoDB<br/>(venue.create)
    participant NC as next/cache
    participant QC as QueryClient
    C->>H: mutateAsync({formState, formData})
    H->>A: mutationFn(formState, formData)
    A->>RR: requireRole('admin')
    alt not admin
        RR-->>A: throw
        A-->>H: rejects → onError
    else admin
        A->>SV: checkDuplicateName(name, city)
        alt duplicate
            SV-->>A: true
            A-->>H: FormState { success:false, errors.general }
            H-->>C: onSuccess no-op → inline error
        else unique
            A->>SV: create(data)
            SV->>DB: venue.create
            DB-->>SV: venue
            SV-->>A: venue
            A->>NC: revalidatePath('/admin/tours/new','/admin/tours')
            A-->>H: FormState { success:true, data:{venueId} }
            H->>QC: onSuccess → invalidateQueries(venues.all), (tours.all)
            H-->>C: FormState → select new venue + close dialog
        end
    end`,
  },
  {
    file: '16-use-update-venue-mutation.mmd',
    title: '16. useUpdateVenueMutation — edit a venue (inline)',
    src: `%% useUpdateVenueMutation — inline venue edit
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(venue-select)
    participant H as useUpdateVenueMutation<br/>(useMutation)
    participant A as updateVenueAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as VenueService.update
    participant DB as Prisma · MongoDB<br/>(venue.update)
    participant NC as next/cache
    participant QC as QueryClient
    C->>H: mutateAsync({venueId, formState, formData})
    H->>A: mutationFn(venueId, formState, formData)
    A->>RR: requireRole('admin')
    alt not admin / invalid id
        A-->>H: throw or FormState { success:false }
        H-->>C: onError / onSuccess no-op → error
    else admin
        A->>SV: update(venueId, data)
        SV->>DB: venue.update
        DB-->>SV: venue
        SV-->>A: venue
        alt success
            A->>NC: revalidatePath('/admin/tours/new','/admin/tours','/tours','/tours/[tourId]')
            A-->>H: FormState { success:true }
            H->>QC: onSuccess → invalidateQueries(venues.all), (tours.all)
            H-->>C: FormState → close dialog
        else failure
            A-->>H: FormState { success:false, errors }
            H-->>C: onSuccess no-op → inline error
        end
    end`,
  },
  // ── Featured artists ────────────────────────────────────────────────────
  {
    file: '17-use-create-featured-artist-mutation.mmd',
    title: '17. useCreateFeaturedArtistMutation — create a featured artist',
    src: `%% useCreateFeaturedArtistMutation — create a featured artist
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(featured-artist-form)
    participant H as useCreateFeaturedArtistMutation<br/>(useMutation)
    participant A as createFeaturedArtistAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as FeaturedArtistsService<br/>.createFeaturedArtist
    participant DB as Prisma · MongoDB<br/>(featuredArtist.create)
    participant NC as next/cache + simple-cache<br/>(featured-artists:)
    participant QC as QueryClient
    C->>H: mutateAsync({formState, formData})
    H->>A: mutationFn(formState, formData)
    A->>RR: requireRole('admin')
    alt not admin
        RR-->>A: throw
        A-->>H: rejects → onError
    else admin
        A->>SV: createFeaturedArtist(data)
        SV->>DB: featuredArtist.create (+ artists connect)
        DB-->>SV: featuredArtist
        SV-->>A: { success, data }
        alt success
            A->>NC: revalidatePath('/admin','/'), cache.deleteByPrefix('featured-artists:')
            A-->>H: FormState { success:true, data:{featuredArtistId} }
            H->>QC: onSuccess → invalidateQueries(featuredArtists.all)
            H-->>C: FormState → toast + redirect
        else failure
            A-->>H: FormState { success:false, errors }
            H-->>C: onSuccess no-op → error toast
        end
    end`,
  },
  {
    file: '18-use-update-featured-artist-cover-art-mutation.mmd',
    title: '18. useUpdateFeaturedArtistCoverArtMutation — persist cover art',
    src: `%% useUpdateFeaturedArtistCoverArtMutation — persist cover art (edit mode)
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(featured-artist-form · CoverArtField)
    participant H as useUpdateFeaturedArtistCoverArtMutation<br/>(useMutation)
    participant A as updateFeaturedArtistCoverArtAction<br/>('use server')
    participant RR as requireRole('admin')
    participant DB as Prisma · MongoDB<br/>(featuredArtist.update)
    participant NC as next/cache + simple-cache<br/>(featured-artists:)
    participant QC as QueryClient
    U->>C: upload cover art (S3 + variants done)
    C->>H: mutateAsync({featuredArtistId, coverArt})
    H->>A: mutationFn(featuredArtistId, coverArt)
    A->>RR: requireRole('admin')
    alt not admin / invalid input
        A-->>H: throw or { success:false, error }
        H-->>C: onError / onSuccess no-op → throw
    else admin
        A->>DB: featuredArtist.update({ coverArt })
        DB-->>A: ok
        A->>NC: cache.deleteByPrefix('featured-artists:'), revalidatePath('/')
        A-->>H: { success:true }
        H->>QC: onSuccess → invalidateQueries(featuredArtists.all)
        H-->>C: success
    end`,
  },
  {
    file: '19-use-publish-featured-artists-mutation.mmd',
    title: '19. usePublishFeaturedArtistsMutation — publish to landing page',
    src: `%% usePublishFeaturedArtistsMutation — publish carousel to the home page
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(featured-artist-data-view)
    participant H as usePublishFeaturedArtistsMutation<br/>(useMutation)
    participant A as publishFeaturedArtistsToSiteAction<br/>('use server')
    participant RR as requireRole('admin')
    participant NC as next/cache + simple-cache<br/>(featured-artists:)
    participant QC as QueryClient
    U->>C: click "Publish to Landing Page"
    C->>H: mutateAsync()
    H->>A: mutationFn()
    A->>RR: requireRole('admin') — caught internally
    alt unauthorized
        A-->>H: { success:false, error:'Unauthorized' }
        H-->>C: onSuccess no-op → toast error
    else authorized
        A->>NC: cache.deleteByPrefix('featured-artists:'), revalidatePath('/')
        A-->>H: { success:true }
        H->>QC: onSuccess → invalidateQueries(featuredArtists.all)
        H-->>C: success → toast
    end`,
  },
  // ── Banner notifications ────────────────────────────────────────────────
  {
    file: '20-use-upsert-banner-notification-mutation.mmd',
    title: '20. useUpsertBannerNotificationMutation — save a banner slot',
    src: `%% useUpsertBannerNotificationMutation — save/replace a banner slot
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(banner-slot-card · useActionState)
    participant H as useUpsertBannerNotificationMutation<br/>(useMutation)
    participant A as createOrUpdateBannerNotificationAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as BannerNotificationService<br/>.upsertNotification
    participant DB as Prisma · MongoDB<br/>(bannerNotification.upsert)
    participant NC as next/cache + service cache
    participant QC as QueryClient
    C->>H: mutateAsync({formState, formData})
    H->>A: mutationFn(formState, formData)
    A->>RR: requireRole('admin') — caught internally
    alt unauthorized / invalid
        A-->>H: FormState { success:false, errors._form }
        H-->>C: onSuccess no-op → field errors
    else authorized
        A->>SV: upsertNotification(slot, data) (server-sanitized HTML)
        SV->>DB: bannerNotification.upsert (+ invalidate service cache)
        DB-->>SV: notification
        SV-->>A: { success, data }
        A->>NC: revalidatePath('/','/admin/notifications')
        A-->>H: FormState { success:true, data:{notificationId} }
        H->>QC: onSuccess → invalidateQueries(banners.all)
        H-->>C: FormState → "Saved successfully"
    end`,
  },
  {
    file: '21-use-delete-banner-notification-mutation.mmd',
    title: '21. useDeleteBannerNotificationMutation — delete a banner slot',
    src: `%% useDeleteBannerNotificationMutation — delete a banner slot ({success,error})
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(banner-slot-card)
    participant H as useDeleteBannerNotificationMutation<br/>(useMutation)
    participant A as deleteBannerNotificationAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as BannerNotificationService<br/>.deleteNotification
    participant DB as Prisma · MongoDB<br/>(bannerNotification.delete)
    participant NC as next/cache + service cache
    participant QC as QueryClient
    U->>C: click "Delete Notification"
    C->>H: mutateAsync({slotNumber})
    H->>A: mutationFn(slotNumber)
    A->>RR: requireRole('admin') — caught internally
    alt unauthorized / service failure
        A-->>H: { success:false, error }
        H-->>C: onSuccess no-op
    else authorized
        A->>SV: deleteNotification(slotNumber)
        SV->>DB: bannerNotification.delete (+ invalidate service cache)
        DB-->>SV: ok
        SV-->>A: { success }
        A->>NC: revalidatePath('/','/admin/notifications')
        A-->>H: { success:true }
        H->>QC: onSuccess → invalidateQueries(banners.all)
        H-->>C: success → reset slot fields
    end`,
  },
  {
    file: '22-use-update-rotation-interval-mutation.mmd',
    title: '22. useUpdateRotationIntervalMutation — set carousel rotation interval',
    src: `%% useUpdateRotationIntervalMutation — set banner rotation interval ({success,error})
sequenceDiagram
    autonumber
    actor U as Admin
    participant C as Component<br/>(rotation-interval-form)
    participant H as useUpdateRotationIntervalMutation<br/>(useMutation)
    participant A as updateRotationIntervalAction<br/>('use server')
    participant RR as requireRole('admin')
    participant SV as BannerNotificationService<br/>.updateRotationInterval
    participant DB as Prisma · MongoDB
    participant NC as next/cache + service cache
    participant QC as QueryClient
    C->>H: mutateAsync({interval})
    H->>A: mutationFn(interval)
    A->>RR: requireRole('admin') — caught internally
    alt unauthorized / out of range (3–15)
        A-->>H: { success:false, error }
        H-->>C: onSuccess no-op → error message
    else authorized
        A->>SV: updateRotationInterval(interval)
        SV->>DB: persist interval (+ invalidate service cache)
        DB-->>SV: ok
        SV-->>A: { success }
        A->>NC: revalidatePath('/')
        A-->>H: { success:true }
        H->>QC: onSuccess → invalidateQueries(banners.all)
        H-->>C: success → "Rotation interval updated"
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
<title>boudreaux — Mutation Hook Sequence Diagrams</title>
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

const htmlPath = join(here, 'mutation-hook-sequences.html');
writeFileSync(htmlPath, html);
console.info('Wrote mutation-hook-sequences.html');

// 3) Print to PDF via headless Chromium (Playwright, already installed).
const pdfPath = join(here, 'mutation-hook-sequences.pdf');
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
  console.info('Wrote mutation-hook-sequences.pdf');
} finally {
  await browser.close();
}
