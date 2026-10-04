# A rewritten spec keeps the cases for the half it did not change

When a route or module is split — one half rewritten, the other half kept as
it was — and its spec is rewritten to match, the new spec must carry the old
cases for the kept half too. "Replace the tests" means replace the tests of
what changed, not of the whole file.

On 2026-10-01 (PR #807) the bundle download route lost its policy half to
the download gate and kept its ZIP production — archiver, S3 prefetch,
multipart cache upload, SSE/stream/302 delivery. The 2,972-line spec (139
cases) was rewritten as a 484-line spec (30 cases) that tested the adapter
thoroughly and the pipeline only along its happy paths. Nothing failed
locally: the unit gate is pass/fail, not coverage. The pre-push hook's
coverage check then reported branch coverage at 94.83% against the 95%
floor, and 42 of the uncovered branches were in that route — prefetch past
the depth, a null S3 body after the first, a mid-drive S3 failure, an
archiver error, client cancellation, the title and header fallbacks. Each
had been a case in the old spec.

Rules:

- Before deleting an old spec, list its cases against the lines they cover.
  Every case whose code survives the change moves to the new spec, adapted
  to the new seams; only the cases for removed code go. Folding a module
  into another is "code that survives": on 2026-10-04 five mutation hooks
  and an upload hook moved into `useArtistPool`, their two specs were
  deleted, and the refusal, rollback and fallback-copy cases went with
  them — branch coverage fell to 94.98% at the pre-push hook until they
  were ported into `use-artist-pool.spec.tsx`.
- A new spec that is much shorter than the one it replaces is a signal, not
  a win. Compare case counts and ask what the missing ones covered.
- Run `pnpm run test:coverage:check` on the branch before pushing a spec
  rewrite. The pass/fail gate cannot see dropped coverage; the hook can,
  and it is slower to learn it there.
- A file that another lane covers (a `*.contract.spec.ts` on Docker Mongo)
  is at 0% in the unit lane. It still needs a unit spec with the stores
  mocked, or the branch floor counts it against the whole suite.
