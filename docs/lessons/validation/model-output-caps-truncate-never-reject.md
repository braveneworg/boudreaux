# Caps on model output truncate; they never reject

A Zod cap on a field the model writes is a cap on _our_ tolerance, not on the
model. Gemini treats a prompt's "<= 300 chars" as advisory and overruns it in
production, so a hard `.max()` in an adjudication schema throws away an entire
synthesis — a full search + scrape + inference run — over a field that often
never reaches the page.

This has now cost real results twice:

- `release-date.ts` — the original. Its `boundedRationale` docs record that a
  hard `.max()` there "nulled real lookups".
- `release-description.ts` (2026-08) — written later, reused neither
  `boundedRationale` nor video's truncation. Gemini wrote a finished blurb
  (`gemini_usage outputTokens: 711`), the schema rejected the parse on a
  400-char `rationale`, and the admin was told "No blurb could be generated".

Rules for any schema parsing model output:

- Bound prose with the shared helpers in `release-date.ts` —
  `boundedProse({ cap, event })` (trims to the last whole sentence, never
  cutting a quote away from its "— Pitchfork" attribution) and
  `boundedRationale(name)`. Never add a bare `.max()` and never write a third
  copy of the truncation.
- Cap **lists** after filtering, not in the schema. `sourceUrls` was
  `.max(10)`, but a run sweeps four queries of ten results each, so a sound
  blurb can cite more than ten links and the whole adjudication was rejected.
  The cap belongs in `enforceSourceSubset`, where it applies after fabricated
  links are dropped and the slots go to verified sources.
- Log every truncation. A cap that fires routinely means the _prompt_ needs
  the fix, not the schema.

Diagnosing this class needs CloudWatch (`/aws/lambda/fakefour-bio-generator`):
a schema rejection, a missing API key, and genuinely absent web evidence all
surface to the admin as the same "could not be generated" toast.

Related: [`zod-url-fields-use-is-http-url.md`](zod-url-fields-use-is-http-url.md)
— the same root cause, reuse before you create, applied to validation.
