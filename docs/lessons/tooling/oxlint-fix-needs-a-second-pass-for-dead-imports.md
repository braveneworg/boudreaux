# `oxlint --fix` needs a second pass to drop the imports a fix orphans

oxlint applies fixes from one lint pass over the original source. When a
fix removes the last use of an import — as `boudreaux/no-component-return-type`
does for `import type { ReactElement } from 'react'` — the
`unused-imports/no-unused-imports` fix for that import is not in the same
pass, because the import was still used when the pass started.

On 2026-11-01 the first `oxlint --fix` over 230 component files stripped
every return annotation and left 103 dead imports behind; the verify run
reported them as `no-unused-vars` + `no-unused-imports` errors. A second
`oxlint --fix` removed them all.

Rules:

- After any `--fix` that can orphan an import, run `pnpm run lint` again
  (it fixes too) and then once more without expecting changes. Stop only
  when a run reports nothing.
- `pnpm run format` after the fixes: shorter signatures let Prettier pull
  lines back together, and the pre-push `format:check` will otherwise fail.
