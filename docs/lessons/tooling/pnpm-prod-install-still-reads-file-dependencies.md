# `pnpm install --prod` still reads every `file:` dependency

**What happened (2026-11-11).** The re-encode Lambda's image installs only
`sharp`. Everything else, the wire contract included, is bundled into the
handler and listed under `devDependencies`. The image's dependency stage ran
`pnpm install --prod --frozen-lockfile` with only `package.json` and the
lockfile copied in, and failed with `ERR_PNPM_FS_PACKLIST_IO`: the lockfile
names `@fakefour/job-contract` as `file:../packages/job-contract`, and pnpm
reads that directory before it installs anything, whether or not `--prod`
would install it.

**The rule.** A `file:` dependency named in the lockfile has to exist at its
relative path wherever `pnpm install` runs, even when it is a dev dependency
and the install is `--prod`.

**How to apply.**

- In a Docker stage that installs for a project with a `file:` dependency,
  copy that directory to the same relative path first. The re-encode Lambda's
  build script copies the contract into `dist/job-contract`, and its
  Dockerfile puts it at `../packages/job-contract` in the dependency stage
  only.
- The app's own Dockerfile already copies `packages/` before its install for
  the same reason (`job-contract-edits-need-reinstall.md` covers the other
  half: a `file:` package is copied, not linked).
