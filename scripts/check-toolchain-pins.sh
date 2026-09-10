#!/bin/sh
# Verify every place that still declares a toolchain version agrees with
# mise.toml, and that nvm/corepack/packageManager have not crept back in.
#
# The pre-push hook checks the toolchain a developer is *running*; it is
# skippable with --no-verify and only exists on machines that ran an install.
# This check is different: it verifies the versions the repo *declares*, so it
# can run in CI where branch protection makes it unskippable. CI installs its
# own toolchain from mise.toml, so it can never catch a wrong local Node — but
# drift between mise.toml and the Dockerfile or engines fields is exactly the
# kind of breakage CI would otherwise ship to production.
#
# Usage: sh scripts/check-toolchain-pins.sh [repo-root]
set -u

root="${1:-.}"
config="$root/mise.toml"
failed=0

fail() {
  echo "❌ $1" >&2
  failed=1
}

if [ ! -f "$config" ]; then
  echo "❌ Cannot read '$config'. Pass the repo root as the first argument." >&2
  exit 1
fi

# Reads a `<tool> = "<version>"` pin out of the [tools] table. Anchored so a
# commented-out pin is never matched.
read_pin() {
  sed -n "s/^$1 *= *\"\\(.*\\)\"[[:space:]]*\$/\\1/p" "$config" | head -1
}

node_pin=$(read_pin node)
pnpm_pin=$(read_pin pnpm)

[ -n "$node_pin" ] || fail "mise.toml does not pin a node version."
[ -n "$pnpm_pin" ] || fail "mise.toml does not pin a pnpm version."

# Nothing further can be checked without a node pin to compare against.
if [ -z "$node_pin" ]; then
  exit 1
fi

# nvm is gone; mise.toml is the only toolchain declaration.
if [ -f "$root/.nvmrc" ]; then
  fail ".nvmrc has reappeared. mise.toml is the only toolchain source of truth."
fi

# The Dockerfile's ARG is only a fallback for ad-hoc local builds (CI passes
# --build-arg NODE from mise.toml), but a stale fallback still builds the wrong
# image by hand, so keep it in step.
dockerfile="$root/Dockerfile"
if [ -f "$dockerfile" ]; then
  docker_node=$(sed -n 's/^ARG NODE=node:\(.*\)-alpine[[:space:]]*$/\1/p' "$dockerfile" | head -1)

  if [ -z "$docker_node" ]; then
    fail "Dockerfile has no 'ARG NODE=node:<version>-alpine' line to check."
  elif [ "$docker_node" != "$node_pin" ]; then
    fail "Dockerfile pins node $docker_node but mise.toml pins $node_pin."
  fi

  if grep -q 'corepack' "$dockerfile"; then
    fail "Dockerfile references corepack. pnpm comes from mise.toml."
  fi
fi

# Every package.json at the root or one level down (the two Lambda workspaces).
# node_modules is pruned so a dependency's own manifest is never inspected.
pkg_files=$(
  find "$root" -maxdepth 2 -name package.json -not -path '*/node_modules/*' 2>/dev/null | sort
)

for pkg in $pkg_files; do
  relative=${pkg#"$root"/}

  if grep -q '"packageManager"' "$pkg"; then
    fail "$relative declares packageManager. pnpm is pinned in mise.toml."
  fi

  engines_node=$(
    sed -n 's/.*"node"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$pkg" | head -1
  )

  if [ -n "$engines_node" ] && [ "$engines_node" != "^$node_pin" ]; then
    fail "$relative engines.node is '$engines_node' but mise.toml pins $node_pin (expected '^$node_pin')."
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "" >&2
  echo "   mise.toml is the single source of truth for the toolchain." >&2
  echo "   Update the files above to match it, or update mise.toml." >&2
  exit 1
fi

echo "✅ Toolchain pins agree with mise.toml (node $node_pin, pnpm $pnpm_pin)"
exit 0
