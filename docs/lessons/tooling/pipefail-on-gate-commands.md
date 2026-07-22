# Piping a gate command eats its exit code

`pnpm run lint 2>&1 | tail -1 && echo OK` reports `tail`'s exit status, not
lint's — a failing gate prints "OK" and the failure surfaces later in a hook
or CI (here: a lint warning that pre-push caught after "LINT-OK" had already
been claimed). When trimming gate output, either `set -o pipefail` first or
check the command bare and trim only on success.
