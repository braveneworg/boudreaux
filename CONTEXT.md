# CONTEXT

The shared vocabulary for this codebase. Terms here are the ones to use in code,
comments, commit messages, and reviews — if a concept has a name in this file,
don't invent a synonym for it.

This file is deliberately small. Every entry below is grounded in code that
exists today; it is a starting point, not a finished ubiquitous language. Add a
term when you name a real concept, not speculatively.

Architectural decisions live in [`docs/adr/`](docs/adr/). Working agreements
live in [`AGENTS.md`](AGENTS.md).

## Failure vocabulary

**DataError** — a data-access or business-rule failure carrying a stable,
vendor-neutral **DataErrorCode**. The repository layer is the only place that
sees Prisma's error taxonomy; it translates that into a `DataError` so nothing
above the repository depends on Prisma. Services also raise `DataError`s of
their own for business-rule failures.
_Defined in_ `src/lib/types/domain/errors.ts`.

**DataErrorCode** — the closed union `DUPLICATE | INVALID_INPUT |
LIMIT_EXCEEDED | NOT_FOUND | UNAVAILABLE | VALIDATION | TIMEOUT | UNKNOWN`. This
is the **stable fact** callers branch on — HTTP status, retry policy, telemetry.

**error copy** — the human-readable message on a failure. Copy is _not_ stable:
it can be overridden per call site. **Never branch on it.** Branch on the code.
See [ADR-0001](docs/adr/0001-service-failures-carry-a-data-error-code.md).

**ServiceResponse&lt;T&gt;** — what a service call returns:
`{ success: true, data: T } | { success: false, error: string, code: DataErrorCode }`.
_Defined in_ `src/lib/services/service.types.d.ts`.

## Layers

**Repository** — the only layer permitted to import Prisma, enforced by
`no-restricted-imports` in `eslint.config.mjs` with a small infra allowlist. Owns
query construction, compare-and-swap claims, and race guards.
_In_ `src/lib/repositories/`.

**Service** — business rules and policy over one or more repositories. Returns
`ServiceResponse`. **All business logic lives here**, and callers always go
through a service — never past it to a repository — even when the service
currently only forwards. See
[ADR-0002](docs/adr/0002-business-logic-stays-in-services.md).
_In_ `src/lib/services/`.

**Server Action** — a mutation entry point (`'use server'`). Mutations go here,
never to an API route.
_In_ `src/lib/actions/`.

**API route** — a query entry point (GET). Reads only; mutations belong in
Server Actions.
_In_ `src/app/api/`.

**decorator** — a route wrapper owning a cross-cutting concern: `withAuth`,
`withAdmin`, `withRateLimit`.
_In_ `src/lib/decorators/`.

## Domain nouns

**Artist** — a person or act. Carries a generated **bio** (long, short, and alt
variants), **bio images**, and reference links.

**Release** — a published body of work by an Artist, with tracks and
**digital formats** available for download. Its first credited Artist is its
**album artist**.

**release credit** — how a Release relates to the Artist whose page lists it:
**primary** (the Artist is its album artist), **featured** (credited, but not
first), or **member** (a release by a band the Artist belongs to). Derived
from credit order and band membership when the page is built, never stored;
an Artist's page lists every release they hold a credit on, primary first.
See [ADR-0006](docs/adr/0006-artist-page-lists-every-release-credit.md).
_Avoid_: role (that is the Video term), guest.

**listed artist** — an Artist shown on the public artists index and found by
its search: active, published, not deleted, and directly credited (primary or
featured) on at least one published Release. A member credit alone does not
list an Artist. See
[ADR-0007](docs/adr/0007-artists-index-lists-only-directly-credited-artists.md).
_Avoid_: visible artist, public artist.

**Video** — an uploaded video asset with **probe** metadata (technical fields
extracted by ffprobe), a **description**, and **enrichment** (externally
sourced facts such as release date; available to any category once the video
names an artist or creator).

**release date** — the day-precision UTC day a Video was released. It is
**never defaulted**: a **draft** may have none, and today only ever appears
because a human typed it. Publishing requires one. See
[ADR-0004](docs/adr/0004-release-date-is-never-defaulted.md).
_Avoid_: release datetime, upload date.

**draft** — a Video row that has not been published, created the moment its
upload completes so that later work has a row to attach to. A draft may lack a
release date and a description.

**release-date lookup** — the bounded automatic search for a Video's release
date from its title and artist, run on upload and on opening a dateless draft.
It retries a fixed number of times per distinct title-and-artist pair and then
stops; a result equal to today's UTC day is a **miss**, not a find.
_Avoid_: autofill, "Find release date".

**pending suggestion** — an enrichment fact that awaits human review before it
changes a Video. A release-date suggestion fills only an **empty** release date
by itself; when a date already exists it stays pending until applied or
dismissed.
_Avoid_: auto-apply (that is what happens to it, not what it is).

**description** — the prose stored on a Video and shown on its page. It is
only ever entered through the enrichment panel — typed by a human there, or
taken from a **description suggestion**. It is never taken from the file and
never synthesized outside enrichment; a **draft** may lack one. See
[ADR-0005](docs/adr/0005-description-is-edited-only-in-the-enrichment-panel.md).
_Avoid_: blurb (a Release's listing copy), summary.

**description suggestion** — the **pending suggestion** that targets a Video's
description: enrichment's synthesized prose, offered beside the description
with its confidence and sources. Applying it overwrites the description; a
blank description takes it without review, and it is never dismissed. See
[ADR-0005](docs/adr/0005-description-is-edited-only-in-the-enrichment-panel.md).

**autosave** — persistence of a single field the moment it changes, without
Save. Today only a persisted Video's release date autosaves, whether a human
picked it or the release-date lookup filled it; Save and Publish still carry
the whole form.

**async job lifecycle** — the shared shape of every background job (bio
generation, video enrichment): `pending → processing → succeeded/failed`, an
atomic token claim, progress checkpoints, and client polling. Its decisions
live in one pure, client-safe module with two deliberately different gate
questions: **blocksNewTrigger** (a fresh `pending` blocks a new trigger — a
queued job is a job) and **runnerShouldSkip** (only a fresh `processing` blocks
the runner — `pending` is the handoff it consumes; collapsing the two
deadlocks). An in-flight job older than the **stale window** (`STALE_JOB_MS`,
above the Lambda's ceiling) is **stale-coerced** to `failed` on read, without
writing; the **client poll deadline** (`CLIENT_POLL_DEADLINE_MS`) exceeds the
stale window so the server's coercion resolves the UI first.
_Defined in_ `src/lib/utils/async-job-lifecycle.ts`.

**bio generation job** — an asynchronous run that produces an Artist's bio via
the `bio-generator` Lambda, following the **async job lifecycle** and reporting
intermediate **progress stages**.

**playback session** — the app-wide guarantee that at most one player is
audible. Any player — a Release, Artist, featured or playlist audio player, or a
Video — **claims** the session when it starts and **releases** it when it goes
away; claiming pauses whoever held it. The session knows only `{ id, pause }`,
which is what lets it span audio and video without either side knowing the other
exists. Distinct from **player preferences** (volume and mute), which are shared
by every player but are settings, not playback state.
