# ADR-0005: A Video's description is edited only in the enrichment panel

- **Status**: Accepted
- **Date**: 2026-09-14

## Context

The admin video form showed **two** "Description" textareas, because they were
two different things:

- The Details section's field was the Video's stored `description`. Three
  writers filled it: the probe's `comment`/`description` container tag, a
  synchronous "Generate description" button (its own Lambda task, route,
  service, and query), and — since #743 — an automatic call to that same sync
  task the moment the release-date lookup resolved.
- The enrichment panel's editable card was a **description suggestion** from
  the async enrichment run. On a blank row the server auto-applied it;
  otherwise it waited with "Use this description".

On production the #743 auto-generate dirtied the form field while the
enrichment Lambda wrote different prose onto the suggestion row; the hook's own
JSDoc called this a "known divergence", and the form won on Save. Two
textareas, two sources of prose, and a race between them.

Enrichment itself was also gated on the MUSIC category, so an INFORMATIONAL
video could never get a description from enrichment at all — only from the
sync button or the file tag.

## Decision

**A Video has one description editor, and it lives in the enrichment panel.
The only source of synthesized prose is the enrichment run.**

- The enrichment panel hosts THE description editor: a textarea bound directly
  to the form's `description`, rendered in every panel phase and with a blank
  artist, seeded from the stored value. The Details section has no description
  field.
- The sync description path is gone: the "Generate description" button, the
  release-date-triggered auto-generate, the query hook and key, the
  `/api/videos/description-lookup` route, the web service, and the Lambda's
  `video-description-lookup` task.
- **A description is never taken from the file.** `extractProbePrefillTags`
  emits no `description`, as it has emitted no `releasedOn` since #699; the
  probe wire no longer carries the field.
- **A description is never synthesized outside enrichment.**
- Enrichment runs for **any category** once the video names an artist or
  creator. The Lambda receives the category: a MUSIC video runs the full flow;
  an INFORMATIONAL video runs a creator-framed, description-only flow (no
  MusicBrainz, Wikidata, identity, release-date, or featured-artist work; no
  quotes; no release-date claim).
- A pending description suggestion is a read-only card beside the editor with
  one action, "Use this description", which overwrites the editor. It is
  applied or ignored — never dismissed. Applied rows and legacy dismissed rows
  render nothing.

## Why this is surprising without context

- The form's Description field is inside the **Web Enrichment** section, not
  under Details with the other metadata. That placement is the point: the
  field and the prose that fills it share one home.
- There is **no description editor before the first upload**. The panel mounts
  once a draft or edit row exists, and Save is schema-blocked without an
  uploaded file anyway.
- A video whose artist/creator is blank cannot get a synthesized description
  until one is added; the panel already shows that hint.

## Why this is hard to reverse

The Lambda task and its wire contract are deleted, not disabled; the
video-enrichment invoke contract now carries `category`, and the probe wire
contract no longer carries `description`. Restoring a sync path would mean
re-adding a task, a route, a service, a query, and a second editor — and
re-introducing the race this decision removes.

## Trade-offs accepted

- No description editor pre-upload (see above).
- The progress timeline renders the skipped music stages of an INFORMATIONAL
  run as completed checkmarks; the timeline contract was left unchanged.
- Legacy dismissed description rows are invisible rather than shown as a muted
  "Dismissed" line.
- A file's `comment` tag no longer seeds the description — admins type or run
  enrichment.
- INFORMATIONAL videos need a named creator before enrichment can describe
  them.

## Alternatives considered

- **Keep both editors and reconcile them.** Rejected: two bindings to one
  field is the defect, not a UI detail to smooth over.
- **Keep the button, drop only the auto-generate.** Rejected: the button is a
  second synthesis path with its own prompt, route, and rate limit; the
  divergence would just become manual.
- **Keep the MUSIC gate and add a separate INFORMATIONAL path.** Rejected: the
  Lambda already branches per category cheaply, and one gate ("names an
  artist") is simpler to keep consistent across the planner, the trigger
  action, the service backstop, and the UI than two.
- **Honest timeline stages for the informational flow.** Deferred: it needs a
  contract change for a cosmetic gain; the run still reports the stages it
  actually performs.
