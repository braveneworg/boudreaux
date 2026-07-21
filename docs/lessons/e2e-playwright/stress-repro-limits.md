# The stress-repro recipe only works for light specs

The `--workers=N --repeat-each=M` stress-repro recipe only works for LIGHT
specs: N parallel copies of a heavyweight spec (draft upload → probe →
enrichment) overwhelm the local Docker Mongo (ReplicaSetNoPrimary
server-selection timeouts) and fail on infrastructure noise unrelated to the
bug under test — and a spec designed for cross-spec parallel safety is not
self-parallel-safe (copies share fixture names). Verify race fixes against the
CI trace evidence plus a CI-shaped run (the DIFFERENT neighboring specs
sharing workers), not self-stress.
