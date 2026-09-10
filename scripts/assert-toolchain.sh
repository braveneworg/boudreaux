#!/bin/sh
# Assert that the Node and pnpm on PATH match the pins in mise.toml.
#
# mise.toml is the single source of truth for this repo's toolchain, but a hook
# inherits whatever is on $PATH — mise only activates for people who have hooked
# their shell. This turns "the docs asked you to run mise install" into an
# enforced gate.
#
# Usage: sh scripts/assert-toolchain.sh [path/to/mise.toml]
set -u

config="${1:-mise.toml}"

if [ ! -f "$config" ]; then
  echo "❌ Toolchain check: cannot read '$config'." >&2
  echo "   Run this from the repo root, where mise.toml lives." >&2
  exit 1
fi

# Reads a `<tool> = "<version>"` pin out of the [tools] table. Anchored at the
# start of the line so a commented-out pin is never matched.
read_pin() {
  sed -n "s/^$1 *= *\"\\(.*\\)\"[[:space:]]*\$/\\1/p" "$config" | head -1
}

fail() {
  echo "" >&2
  echo "❌ Toolchain mismatch: $1" >&2
  echo "" >&2
  echo "   mise.toml is the single source of truth for this repo's toolchain." >&2
  echo "   Fix it with:  mise install" >&2
  echo "" >&2
  echo "   If mise install does not change anything, your shell is not using" >&2
  echo "   mise's tools. Activate mise (see docs/instructions/" >&2
  echo "   official-setup-instructions.md), and if you have ever run" >&2
  echo "   'corepack enable' on a mise-managed Node, run 'corepack disable' —" >&2
  echo "   its pnpm shim shadows the pnpm that mise installs." >&2
  exit 1
}

expected_node=$(read_pin node)
if [ -n "$expected_node" ]; then
  if ! actual_node=$(node -v 2>/dev/null); then
    fail "node is not on PATH, but mise.toml pins node $expected_node."
  fi

  actual_node=${actual_node#v}
  if [ "$actual_node" != "$expected_node" ]; then
    fail "node is $actual_node, but mise.toml pins $expected_node."
  fi
fi

expected_pnpm=$(read_pin pnpm)
if [ -n "$expected_pnpm" ]; then
  if ! actual_pnpm=$(pnpm --version 2>/dev/null); then
    fail "pnpm is not on PATH, but mise.toml pins pnpm $expected_pnpm."
  fi

  if [ "$actual_pnpm" != "$expected_pnpm" ]; then
    fail "pnpm is $actual_pnpm, but mise.toml pins $expected_pnpm."
  fi
fi

exit 0
