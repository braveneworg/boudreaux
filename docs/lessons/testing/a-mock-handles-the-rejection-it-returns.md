# A mock handles the rejection it returns

**What happened (2026-11-14).** The view beacon posts and ignores a failed
request: `fetch(...).catch(() => {})`. Its spec was meant to prove the
catch is there, by listening for `unhandledRejection` and expecting none.
It was written twice in a way that could not fail.

- First, the test made the rejected promise itself and awaited
  `failure.catch(() => undefined)` to wait for it. That catch handles the
  rejection, with or without the hook's.
- Then, on a reviewer's advice, `fetchMock.mockRejectedValueOnce(error)`
  with no catch in the test. With the hook's `.catch` deleted outright the
  spec still passed. A `vi.fn` records how each promise it returns settles
  (`mock.settledResults`), and the handlers it attaches for that count as
  handling the rejection.

An earlier check had "proved" the first version by swapping `.catch` for
`.then`. That fails for another reason: the promise `.then` derives is a new
one, and nobody handles it. Deleting the catch is the mutation that matters,
and it passed.

**The rule.** To prove code handles a rejection, hand it a promise nothing
else touches: a plain function, not a mock, and no `await` or `.catch` on it
in the test.

```ts
let asked = 0;
vi.stubGlobal('fetch', () => {
  asked += 1;
  return Promise.reject(new Error('offline'));
});
const unhandled = vi.fn();
process.on('unhandledRejection', unhandled);
// render, then wait one macrotask: Node reports the rejection after it
await new Promise((resolve) => setTimeout(resolve, 0));
process.removeListener('unhandledRejection', unhandled);
expect(unhandled.mock.calls).toEqual([]);
```

**How to apply.**

- Prove an "it does not throw" or "it handles the failure" case by deleting
  the handler, not by changing it into something else. A changed handler can
  fail for a reason the real omission would not.
- A fix a reviewer suggests for a test that cannot fail is checked the same
  way as the test it replaces. This one was applied and could not fail
  either.
- Count the calls with a plain counter when the function cannot be a mock.
