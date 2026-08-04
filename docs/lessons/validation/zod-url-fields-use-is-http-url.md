# Zod URL fields use isHttpUrl, never bare z.string().url()

`z.string().url()` admits `javascript:`/`data:` scheme URLs. This repo already
fixed that class twice (`bio-generation-schema`, `bio-link-input-schema`) with
`isHttpUrl` (`src/lib/utils/is-http-url.ts` — http/https + host required), yet
a 2026-08 design doc re-specified bare `.url()` for admin-supplied poster URLs
and the defect propagated plan → implementation until task review caught it.
When a schema validates any externally-supplied URL, use
`z.string().max(N).refine(isHttpUrl, …)` — and when writing specs/plans, treat
"reuse before you create" as applying to validation patterns too.
