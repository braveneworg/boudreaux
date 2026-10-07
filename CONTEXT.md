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
variants), **bio images**, and reference links. A bio has no release state of
its own: it is public only while its Artist is a **public artist**, and only
on that Artist's own page — never on an Artist reached through another record
(a release credit, a band member or band, a tour headliner).

**bio image** — one image in an Artist's pool: discovered by a bio generation
job or uploaded by an admin, always re-hosted on our CDN with its license and
attribution. A bio image is either **generated** (owned by the job, replaced on
regeneration) or **custom** (owned by a human, kept through regeneration). An
admin upload is custom from birth; choosing a generated image as a display
image makes it custom. See
[ADR-0008](docs/adr/0008-display-images-are-chosen-by-humans-and-survive-regeneration.md).
_Avoid_: artist image, photo, `Image` (the legacy table nothing public reads).

**display images** — the ordered set of bio images shown for an Artist: all
of them as a collage on the public artist page, the first one on its index
card. There is no cap. Chosen and ordered only by a human; a bio generation
job may **suggest** images but never chooses or displaces a human's choice.
On the admin surface the pool and this set are one client module, the
**artist pool** (`useArtistPool`): every write to either goes through it, a
media manager upload joins the set (last), and a bio editor upload stays in
the pool. Publishing an Artist needs at least one chosen display image
([ADR-0019](docs/adr/0019-publishing-an-artist-needs-a-chosen-display-image.md)).
While no human has chosen, a published Artist's page shows up to three
suggested images that have alt text, or else the first three pool images
that have alt text; the admin marks those tiles **Shown**. An image without
alt text is never shown unless a human chose it. See
[ADR-0008](docs/adr/0008-display-images-are-chosen-by-humans-and-survive-regeneration.md).
_Avoid_: primary images, hero image, featured images (featured is a release
credit).

**genre** — one term describing the music an Artist makes, stored on
`Artist.genres` as a comma-joined list in one normalised form: lowercase and
dash-separated, with `&` and `+` spelled out (`R&B` stores as `r-and-b`).
Human-owned: a bio generation job may **suggest** genres only into a blank
field and never displaces a curated one. Rendered title-cased at read time,
never stored that way. The first three appear on artist cards; the rest show
only on the artist's own page. See
[ADR-0009](docs/adr/0009-genres-are-human-owned-and-survive-regeneration.md).
_Avoid_: style, category, `Genre` (the collection nothing reads — the column
is the source of truth).

**tag** — a free-form term on `Artist.tags`, normalised, owned, and rendered
exactly like a **genre**, but never shown on the public pages. Tags are an
admin's own filing vocabulary. See
[ADR-0009](docs/adr/0009-genres-are-human-owned-and-survive-regeneration.md).
_Avoid_: keyword, label (a Label is a signed-artist entity).

**artist link** — one curated `{ label?, url }` an admin files on an Artist,
shown on that Artist's own page with the label beside the link. Websites and
social links are `http(s)`; a contact link may also be an email (`mailto:`) or
a phone number (`tel:`), stored normalised. The icon derives from the href at
render; no platform is stored. Human-owned: a bio generation job never writes
one. See [ADR-0020](docs/adr/0020-artist-links-are-one-composite-on-the-artist.md).
_Avoid_: URL (the `Url` model carries a platform enum and is not this),
reference link / bio link (an `ArtistBioLink`, discovered by a job).

**link section** — one of the three parts of `Artist.links`: **Websites** and
**Social Media**, flat lists of **artist links**, and **Contact & Misc**, a
list of admin-defined **link groups** (a heading over its links, e.g.
Booking, Merch). Written whole and kept in the admin's order; an empty
section is not shown. See
[ADR-0020](docs/adr/0020-artist-links-are-one-composite-on-the-artist.md).

**Release** — a published body of work by an Artist, with tracks and
**digital formats** available for download. Its credits have a stored order;
the first is its **album artist**. A public surface names the album artist
only while that Artist is a **public artist** — a hidden album artist leaves
the byline empty, and no later credit takes its place.

**release credit** — how a Release relates to the Artist whose page lists it:
**primary** (the Artist is its album artist), **featured** (credited, but not
first), or **member** (a release by a band the Artist belongs to). Derived
from the stored credit order and band membership when the page is built;
an Artist's page leads with its **latest release** and lists every release
they hold a credit on, primary first, at `/artists/[slug]/releases`.
See [ADR-0006](docs/adr/0006-artist-page-lists-every-release-credit.md).
_Avoid_: role (that is the Video term), guest.

**latest release** — the newest listed Release an Artist holds a direct
**release credit** on (primary or featured, never member), by release date:
the one the Artist's page leads with and the artists index card names. A
featured one is shown "by" its album artist when that Artist is public.
Playable (an MP3 track) → its line opens the listening modal in place; else
it links to the release page. See the 2026-10-06 amendment of
[ADR-0006](docs/adr/0006-artist-page-lists-every-release-credit.md).
_Avoid_: newest release (the summary field is named `newestRelease`, but the
page concept is this), featured release.

**listed artist** — an Artist shown on the public artists index and found by
its search: published, not deleted, and directly credited (primary or
featured) on at least one published Release. A member credit alone does not
list an Artist. See
[ADR-0007](docs/adr/0007-artists-index-lists-only-directly-credited-artists.md).
_Avoid_: visible artist.

**public artist** — an Artist the public may learn of: published and not
deleted. Nothing that identifies an Artist — name, aka names, slug, image —
appears on a public surface unless the Artist is public. "Published" alone
means only that a publication date is recorded; a published Artist that is
deleted is still hidden. Whether the Artist is still on the label plays no
part. Every **listed artist** is a public artist; a public artist with no
direct credit is not listed. See
[ADR-0015](docs/adr/0015-a-release-publishes-its-credited-artists-only-by-confirmation.md)
and
[ADR-0016](docs/adr/0016-an-artist-is-public-whether-or-not-it-is-still-on-the-label.md).
_Avoid_: visible artist, published artist (as a synonym), current artist,
alumni, roster (whether an Artist is still on the label decides nothing).

**hidden artist** — any Artist that is not a **public artist**. Hiding an
Artist never hides the work that credits it: a Release stays public without
that byline.
_Avoid_: unpublished artist (one of two ways to be hidden), draft artist.

**credit awaiting confirmation** — a **hidden artist** credited on a Release
who would become public by being published: never published and not
deleted. Publishing the Release publishes such an Artist only when an
admin confirmed that Artist, having been shown what goes live with it. See
[ADR-0015](docs/adr/0015-a-release-publishes-its-credited-artists-only-by-confirmation.md).
_Avoid_: pending artist, unconfirmed artist.

**credit decision** — an admin's choice for one **credit awaiting
confirmation**: publish the Artist with the Release, or keep it hidden.
Publishing a Release needs a decision for every such credit; none is made by
omission. An Artist with no chosen **display image** can only be kept hidden
([ADR-0019](docs/adr/0019-publishing-an-artist-needs-a-chosen-display-image.md)).
The admin who decided is recorded on each Artist published.
_Avoid_: confirmation (the whole step, not one artist's choice), approval.

**credit that stays hidden** — a **hidden artist** credited on a Release whom
publishing cannot make public: deleted.
Reported to the admin with the reason; never blocks a publish and is never
changed by one.

**digital format** — one downloadable encoding of a Release (`MP3_320KBPS`,
`AAC`, `FLAC`, …) with its track files. The **free formats** are the
encodings the **free tier** may take; every other format needs
**entitlement**. See
[ADR-0018](docs/adr/0018-download-entitlement-is-decided-by-one-gate.md).

**withdrawn format** — a **digital format** an admin has soft-deleted. The
**free tier** never gets it; an entitled **download subject** may still
download it until it is hard-deleted, when its files are gone for good.
_Avoid_: deleted format (ambiguous with hard delete).

**playable format** — the one **digital format** a public surface plays:
`MP3_320KBPS`, when it is not withdrawn. Its files are served openly and
need no signature. A public page or payload carries this format and no
other; every other format reaches a listener only through the **download
gate**. A Release whose MP3 is withdrawn has nothing to play.
_Avoid_: stream format, preview format.

**download subject** — who is downloading: a signed-in User, or a **guest**
identified by a visitor cookie together with a browser fingerprint. Every
download rule is keyed on the subject.
_Avoid_: visitor (one half of a guest identity), customer.

**entitlement** — whether a **download subject** holds a non-refunded purchase
of a Release. A refund revokes it. Entitlement decides which rules apply to a
download, never which formats exist.
_Avoid_: access, has purchased (as a synonym for the unrefunded check).

**free tier** — the download rules for a **download subject** without
**entitlement**: the **free formats** only, the **lifetime cap** (a signed-in
user may take five distinct Releases free, ever; a guest has no lifetime cap)
and the **free throttle** (any subject may download one Release three times
per rolling 24 hours). See
[ADR-0018](docs/adr/0018-download-entitlement-is-decided-by-one-gate.md).
_Avoid_: freemium, quota.

**purchase throttle** — the re-download rule for an entitled **download
subject**: five downloads per Release, resetting after six idle hours. More
generous than the **free throttle** by design.
_Avoid_: download limit.

**download gate** — the one decision "may this **download subject** download
these **digital formats** of this Release", and the charge against the
matching cap or throttle, made only once the file to deliver exists. A failed
download is recorded with its reason and charges nothing. See
[ADR-0018](docs/adr/0018-download-entitlement-is-decided-by-one-gate.md).
_Avoid_: download authorization, quota enforcement (two of the four modules it
replaced).

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

**go-live moment** — the instant a published Video becomes visible to the
public, recorded when an admin publishes it. It is distinct from the
**release date**: the release date says when the work came out; the go-live
moment says when this site shows it. A Video with a go-live moment is
**published**, whether that moment has arrived or not.
_Avoid_: publish date (ambiguous with release date).

**scheduled** — a published Video whose go-live moment is still ahead. The
admin listing's published filter includes it; no public surface shows it.
_Avoid_: pending, upcoming, queued.

**live** — a published Video whose go-live moment has arrived. The only
videos a public surface reads; the admin dashboard's published count counts
these alone, so a scheduled Video counts toward the draft side until it goes
live.
_Avoid_: visible, active.

**release-date lookup** — the bounded automatic search for a Video's release
date from its title and artist, run on upload and on opening a dateless draft.
It retries a fixed number of times per distinct title-and-artist pair and then
stops; a result equal to today's UTC day is a **miss**, not a find.
_Avoid_: autofill, "Find release date".

**pending suggestion** — an enrichment fact that awaits human review before it
changes a Video. A release-date suggestion fills only an **empty** release date
by itself, and never when it names today — today only ever appears because a
human typed it; when a date already exists, or the suggestion is today, it
stays pending until applied or dismissed.
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
stale window so the server's coercion resolves the UI first. Its client
half, **job run** (`useJobRun`), tracks one run from its trigger to one
surfaced outcome: it re-reads the status before tracking, so a terminal
state cached from a previous run is never this run's result, and resumes a
run found in flight after a reload.
_Defined in_ `src/lib/utils/async-job-lifecycle.ts` and
`src/app/components/forms/_hooks/use-job-run.ts`.

**signed callback** — a Lambda → app callback or progress POST whose raw body
is HMAC-signed in the `x-job-signature` header with a **job signing key**: a
per-job key the app derives at dispatch from the app-only `JOB_CALLBACK_SECRET`
and the job token, hands to the Lambda inside the invoke payload, and never
stores. The route re-derives the key from the stored token and verifies before
the token compare, so a leaked job token alone can't forge a callback.
See [ADR-0014](docs/adr/0014-lambda-callbacks-are-hmac-signed.md).
_Defined in_ `packages/job-contract/src/signing.ts` and
`src/lib/services/lambda-dispatch.ts`.

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
