# Wait for the dropzone to hydrate before setting a file

`page.goto` resolves at the `load` event. On a production build React has
not yet hydrated the page at that moment: the server markup is there, the
client chunks are still being evaluated, and the file input's `onChange`
handler is not attached. A `setInputFiles` in that gap dispatches a change
event that nothing is listening to. Playwright reports the action as done,
no upload starts, and the assertion that follows (a `waitForURL`, a title
value) times out.

On 2026-10-07 `admin-video-poster-capture.spec.ts` "replacing the file swaps
the frames and the poster" failed this way in CI on a PR that changed only a
CSS class and a line of admin copy. The trace was unambiguous: `goto`
finished at 30072 ms, `setInputFiles` ran at 30101 ms, and the network log
held no request at all after it — no upload, no server action. The
screenshot showed the dropzone still idle and the title field still empty.
The spec had passed CI on the previous eight runs; the race window is tens
of milliseconds wide and depends on how busy the runner is.

Rules:

- A file input owned by a client component gets a hydration marker:
  `VideoDropzone` renders `data-hydrated={useHydrated()}`, `"false"` in the
  server markup and `"true"` once the component runs in the browser. Never
  set a file on it before the marker reads `"true"`.
- Use `pickVideoFile` from `e2e/helpers/video-dropzone.ts`, which waits for
  the marker and then sets the file, instead of calling `setInputFiles` on
  the dropzone directly. A visible heading or a prefilled field proves
  nothing about hydration — both are in the server markup.
- An action that succeeds and leaves no trace in the network log is a lost
  event, the same class as
  [wait-for-the-swapped-surface-before-clicking](wait-for-the-swapped-surface-before-clicking.md).
  Read the trace's timeline before touching the spec: compare the action's
  time with the first request the client code sends after it.
- Do not widen the timeout and do not retry: the handler is not coming for
  that event. Wait for the marker.
