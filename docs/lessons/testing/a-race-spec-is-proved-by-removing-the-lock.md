# A race spec is proved by removing the lock, each time

**What happened (2026-11-11).** The contract spec for the cap of ten
attachments was written from the spec for the cap of five submissions: the
same shape, five concurrent creates, starts staggered 3 ms apart. It passed.
With the serialising write removed from `createWithinCap` it still passed.
The attachment transaction is shorter than the submission one, so at a 3 ms
stagger each create had committed before the next one counted, and nothing
raced.

Eight creates 1 ms apart fail without the lock on every run and pass with
it.

**The rule.** A spec that claims to prove a lock is only proved by running it
with the lock removed and watching the cap assertion fail. Do that for every
new race spec, including one copied from a spec that was proved. The numbers
that make a race (how many writers, how far apart) belong to the write path
they were tuned on, and do not carry over.

**How to apply.**

- Remove the serialising write, run the contract spec a few times, and expect
  the "never stores more than the cap" case to fail every time. If it passes
  even once, tighten the race before trusting the spec.
- Restore the write and run it a few more times to see it pass every time.
- Say in the commit or the write-up that this was done.
