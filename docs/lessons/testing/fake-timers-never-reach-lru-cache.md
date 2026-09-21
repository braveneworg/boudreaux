# Fake timers never reach an lru-cache TTL

`lru-cache` picks its clock once, at module load:

```js
const perf =
  typeof performance === 'object' && performance && typeof performance.now === 'function'
    ? performance
    : Date;
```

`vi.useFakeTimers()` then replaces the `performance` **global**, but `perf`
still points at the object captured earlier, so the cache keeps reading the
real clock. `vi.resetModules()` does not help: it resets the transformed
source graph, not an externalized `node_modules` dependency, so re-importing
the service under frozen time gives it a fresh cache still wired to the real
`performance`.

The trap is that this fails silently in the passing direction. Writing
`artist-vocabulary-service.spec.ts` (2026-09-20), the expiry case failed
honestly — but its companion, "still serves from cache just inside the TTL",
**passed**, because nothing had expired and nothing ever could. A green test
that cannot fail is worse than no test: it reads like coverage of the exact
behaviour nobody verified.

Rules:

- Do not unit-test an `LRUCache` TTL with fake timers. Test what is ours —
  that a hit avoids the repository, that `invalidate()` forces a re-read, that
  fields cache independently — and leave expiry to `lru-cache`.
- Probe before trusting a frozen clock against any third-party cache or timer:
  advance time and assert the dependency's OWN observable behaviour changed.
  `performance.now()` moving proves only that the global moved.
- When a pair of tests straddles a boundary and only one fails, check whether
  the passing one is capable of failing before you "fix" the failing one.

See also [`freeze-clock-in-time-boundary-tests.md`](freeze-clock-in-time-boundary-tests.md),
which covers the case where freezing the clock IS the fix.
