# An optimistic row is not a stored row

The chat drawer shows a sent message the moment Enter is pressed: an
optimistic row with `data-pending="true"`, before the send action has
answered. A test that asserts the text is visible and then ends closes its
page with the request still in flight. Whether the message is stored then
depends on how fast the server is.

`admin-chat-user-detail.spec.ts` did this. Its first test sent "detail view
seed message" and stopped at `getByText(...).toBeVisible()`. Its third test
then looked for that message in the admin detail view. On 2026-11-08 the
third test failed in 2 of 3 dev-server runs with 4 workers before any other
change, and in 2 of 5 runs after the moderation spec stopped touching
`testuser`. A read-only query of the Docker Mongo after a failing run found
every other spec's message for `testuser` and not this one. A probe that
logged the page's requests showed the server action POST starting about
30 ms before the test ended, with no response before the page closed. The
production build answers fast enough that it rarely lost.

Rules:

- When a later test, or another page, reads what a test sent, wait for the
  stored copy, not the optimistic one. In the chat drawer that is
  `sendChatMessage` (`e2e/helpers/send-chat-message.ts`): the composer is
  empty and enabled again, and the row is neither `data-pending` nor
  `data-failed`.
- A test that passes while the next test can't find its data is ending too
  early. Query the database after a failing run before blaming the reader.
- `toBeVisible()` on text you just submitted proves the client rendered it.
  It does not prove the server got it.
