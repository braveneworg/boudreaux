# Exact pins make pnpm silently exempt fresh releases from the cooldown

pnpm enforces a release-age cooldown here even though `minimumReleaseAge` is
unset in config: a `^` range resolves to the newest version old enough to pass
it (a 2026-09-10 install took better-auth 1.7.3 over 1.7.4, published hours
earlier). An EXACT pin to a version still inside the cooldown can't fall back,
so with `minimumReleaseAgeStrict` off pnpm 12 appends it — and its
sub-packages — to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`,
weakening the supply-chain policy without failing the install. After any
install that pins versions, `git diff pnpm-workspace.yaml`; revert added
exclusions and target the newest version that clears the cooldown (publish
dates are in the registry document's `time` field).
