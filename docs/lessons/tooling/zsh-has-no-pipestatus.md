# zsh has no `PIPESTATUS`

The Bash tool runs zsh here, where bash's `${PIPESTATUS[0]}` expands to empty:
`pnpm install … | tail; echo "EXIT=${PIPESTATUS[0]}"` printed `EXIT=` and
proved nothing. Use `set -o pipefail` (zsh supports it) or zsh's
`$pipestatus[1]` — or run the command bare, per
[pipefail-on-gate-commands](pipefail-on-gate-commands.md).
