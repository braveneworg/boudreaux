# Architecture Review

How `/improve-codebase-architecture` (and any review that proposes refactors
from a reading of the code) must write its cards in this repo.

## No card without a reachability proof

A card may claim a **defect** — "X can happen", "Y is bypassed", "Z stores
the wrong value" — only when it carries a proof that the broken line is
reachable from a real entry point **at the commit the review ran on**. A
claim read off the code is a hypothesis, not a finding; the 2026-09-30
review wrote ten defect cards and five collapsed in grilling because the
writer, the field, or the route they named was already gone.

Three proof shapes, weakest to strongest. Every defect card names which
one it carries and shows it:

1. **Call-site list** — the path from an entry point (route handler, Server
   Action, job runner, cron, script) to the defective line, as `file:line`
   citations re-read at `HEAD`. Every hop must exist today: a deleted write
   route, a removed field, or a renamed export voids the card.
2. **Repro** — a contract spec or scratch script against the Docker Mongo
   (`localhost:27018`, never a live database — root `AGENTS.md`, hard
   constraint 1) that shows the wrong state or the race.
3. **Failing test** — a spec that fails on `HEAD` and should pass after the
   fix. It becomes the first commit of the fix PR.

A card with no proof is still allowed, but it is a **shape** card — a
module, a seam, a type to introduce — and says so in its badge. It makes no
"can happen" claim and its Wins list no bugs. Shape cards are grilled on
their design merit alone.

## What the proof changes

- The explorer sub-agents' claims are leads, not findings. Before a card is
  written, the reviewing session re-reads every cited `file:line` at `HEAD`
  and walks the call path itself (shape 1 at minimum).
- Cards are dated with the baseline commit. A card older than the branch it
  is grilled on is re-proved before grilling starts — the grilling session
  runs the call-site check first and drops the card if it fails.
- Recommendation strength follows the proof: `Strong` needs shape 2 or 3;
  shape 1 alone caps at `Worth exploring`; no proof is `Speculative` or a
  shape card.

## Why

The review is cheap; the grilling is not — one session per card, each
starting from the card's claims. Moving the call-site check into the review
spends the tokens once and lets grilling start from verified defects.
