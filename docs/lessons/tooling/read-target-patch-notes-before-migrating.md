# Read every patch note up to the target version before planning a migration

A minor's `.0` release notes are not the migration spec for a later patch.
better-auth 1.7.0 made `Account.issuer` required (with a production backfill);
1.7.3 — the version actually resolved — reverted it ("restored the 1.6 account
core schema… No backfill is needed"). A session designed a schema change, a
prod snapshot, and a backfill runbook from the 1.7.0 notes alone. Before
designing any upgrade migration, read the notes for EVERY release from the
current version up to the resolved target, and confirm each breaking change
against the target's installed source in `node_modules`.
