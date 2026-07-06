# Bio image volume & quality — more vision-verified photos, quality held

- **Date:** 2026-07-06
- **Status:** Design approved; awaiting spec review
- **Branch:** `feat/bio-more-photos` (off `main` @ v4.184.0)

## Problem

After the v4.184.0 hang fix, the first real Ceschi regeneration succeeded but the
image result underwhelmed: the Lambda produced 52 images, only ~10 surfaced in
the admin palette, and one or two of those were not photos of Ceschi. We want
**more images and higher quality at the same time** — which pull against each
other at the quality gate, so the only honest path is to grow the _input_ of
good candidates rather than loosen the gate.

## Evidence — the Ceschi run (CloudWatch `87108d89`, `/aws/lambda/fakefour-bio-generator`)

The Lambda's 52 images broke down as:

| Source                                               | Count  |
| ---------------------------------------------------- | ------ |
| Wikidata portrait (Commons)                          | 1      |
| Commons category photos                              | 6      |
| Cover Art Archive album covers (`kind: cover`)       | 25     |
| Vision-verified scraped press photos (`kind: photo`) | 20     |
| **Total (`enrichment_complete`)**                    | **52** |

Two bottlenecks, in the two places photos are lost:

1. **Lambda vision cap.** Scraping discovered **311** image candidates
   (`scraped_images_merged candidates: 311`), but `MAX_VISION_CANDIDATES = 60`
   let only 60 into the vision gate (20 verified). **251 candidates were discarded
   before vision ever looked at them.** Discovery is not the bottleneck; the cap is.
2. **Web re-host drop.** The web side (`BioImageService.rehostImages`) then culled
   52 → ~10 via blur/low-res rejection, perceptual-hash dedupe, and dropped
   re-host fetches (403/oversize/timeout). The exact split is **not yet known** —
   web logs are in Loki/Grafana, not visible from the current shell.

The "not a photo of Ceschi" images are almost certainly some of the 25 album
covers, which bypass the face-vision gate by design (a cover is art, not a face).

## Goal

Surface **noticeably more vision-verified photos** (target ~2–3× current) with the
quality bar unchanged, keeping all album covers.

## Non-goals

- No loosening of quality floors (`MIN_IMAGE_DIMENSION`, `MIN_SHARPNESS_VARIANCE`).
- No change to the covers policy (keep all covers), prose, or links.
- Not chasing a specific displayed count; displayed count depends on both
  workstreams and is tuned iteratively.

## Design

### Workstream 1 — Lambda: raise the vision cap

- Raise `MAX_VISION_CANDIDATES` from **60 → 180**, and make it **env-overridable**
  (read `VISION_CANDIDATE_LIMIT`, default 180) so we tune without a code redeploy.
  Tunable ceiling ~300 (verify nearly all of Ceschi's 311).
- **Effect:** ~3× the candidate pool reaches vision. Every candidate still gets the
  same Gemini face-verification (`verifyScrapedImages`, fail-closed), so precision
  is unchanged — more photos, not a looser bar. Provenance-guaranteed sources
  (Commons, Cover Art Archive) already bypass vision and are unaffected.
- **Cost model:** vision runs sequential batches of `VISION_BATCH_SIZE = 10`
  (~8 s each). 60 = 6 batches ≈ 48 s; 180 = 18 batches ≈ 2.4 min; 300 ≈ 4.3 min.
  All comfortably within the Lambda's 900 s budget. Money cost is pennies (Gemini
  Flash, images tokenized small). The cap is a _max_ — sparse artists verify fewer
  and cost less, so the increase only spends where there is more to find.
- **Constraint to respect:** vision shares the Gemini budget/rate-limit with the
  prose ensemble (draft-and-synthesize + critique + revise, each with up to 90 s of
  429 backoff). 180 is a safe first step; 300 is the aggressive end.

### Workstream 2 — Web: measure, then fix the 52 → 10 drop

Measure-first, because the web-side split is currently inferred, not observed.

- **2a — Instrument `rehostImages`.** Emit one structured summary per generation:
  `input`, `accepted`, `low_quality_rejected`, `deduped`, `fetch_failed` (with
  status codes). Deploy, regenerate Ceschi, and read the real split from the logs.
- **2b — Fix the _recoverable_ losses 2a reveals.** The fix is chosen from the
  measured split, not prejudged. Prime suspect is **403/hotlink fetch failures**
  on scraped URLs (retry the re-host fetch with proper headers — User-Agent /
  Referer — and/or reuse the #548 "bio-thumbs 403 bypass" proxy path). But note a
  vision-verified photo already fetched cleanly once inside the Lambda, so the web
  drop may instead be dominated by **low-res rejects** (a photo can pass face-vision
  yet fail `MIN_IMAGE_DIMENSION`) or **dedupe** of near-identical covers. Genuine
  blur/low-res rejects are the gate working and **stay**. Dedupe
  (`NEAR_DUPLICATE_MAX_DISTANCE = 10`) stays unless 2a shows it merging _distinct_
  images (all 25 covers must survive).

### Unchanged

`MAX_IMAGES = 100` (headroom — projected ~82), `MAX_PRIMARY = 3`,
`MAX_COVER_ART = 40`, and all quality floors.

## Decisions (user-approved)

- Vision cap **180** to start, tunable to ~**300** later (env-overridable).
- **Keep all album covers**; raise photo volume so real photos outnumber them.
- **Grow input, keep the bar high** — do not loosen quality floors to inflate count.
- **Measure the web-side drop before fixing it.**

## Sequencing & deploys

A tune loop, like the hang fix:

1. Raise the cap (Lambda) + instrument `rehostImages` (web). TDD each.
2. Deploy Lambda + web.
3. Regenerate Ceschi; read the real 52→10 split from the new logs.
4. Apply the 2b web fix targeting the observed losses. TDD.
5. Redeploy web; regenerate Ceschi; confirm the richer count and that quality held.

Two-ish deploys. Lambda deploy first each round (it produces the candidates).

## Testing (TDD)

- **Lambda:** the vision cap is respected at the new default; `VISION_CANDIDATE_LIMIT`
  env override changes it; existing `MAX_VISION_CANDIDATES` cap test updated to the
  new value.
- **Web:** `rehostImages` emits the instrumentation summary with correct counts;
  a re-host fetch that 403s is retried with headers and, on success, the image is
  kept (regression against silent 403 loss).

## Risks / tradeoffs

- **Gemini rate-limit pressure** rises with the cap; mitigated by starting at 180
  and the existing 429 backoff. Revisit if `vision_batch_failed` events climb.
- **Web-side split is unknown** until 2a ships; 2b scope firms up only after we see
  real numbers, so the plan treats 2b as measure-then-fix, not fix-blind.

## Open questions (resolved by 2a instrumentation)

- Of the 52→10 web drop, how much is legitimate culling (dedupe of similar covers,
  genuine blur/low-res) versus recoverable loss (403/fetch failures on good photos)?
