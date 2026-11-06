# macOS bash 3.2 treats an empty array as unbound under `set -u`

The shell-script specs (`pnpm run test:shell`) run each script with
`spawnSync('bash', …)`. On a Mac that is `/bin/bash` 3.2; CI's ubuntu runner
has bash 5. In bash 3.2, `"${arr[*]}"` on an array that was declared but
never appended to is an "unbound variable" under `set -u`, and the script
dies before it prints anything.

On 2026-11-05 `check-social-provider-intent.sh` collected missing names into
`missing=()` and joined them with `"${missing[*]}"`. Every complete provider
hit the empty case, so the specs saw exit 1 and only
`missing[*]: unbound variable` on stderr — which read like the check failing,
not the script crashing.

Rules:

- In a script with `set -u`, build lists as a delimited string
  (`missing="${missing:+$missing,}$name"`) instead of an array you might
  expand while empty. If you need an array, expand it as
  `${arr[@]+"${arr[@]}"}`.
- When a shell spec fails with the wrong exit code, print the child's
  stderr (a `node -e` `spawnSync` with the spec's env) before changing the
  script's logic: an interpreter error looks exactly like a red check.
- A script that passes on CI's bash 5 can still fail every local run; run
  `pnpm run test:shell` locally before pushing a shell change.
