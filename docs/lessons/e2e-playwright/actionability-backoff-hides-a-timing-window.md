# Playwright's actionability backoff can hide a timing window

An action waits until its element is stable, and when it is not, Playwright
retries after 0, 20, 100, 100 and then 500 ms. A spec that hovers an element
inside an opening drawer therefore acts about 800 ms after the drawer opened
on a quiet machine, whatever the spec's own steps take. Any app behaviour
that lasts a few hundred milliseconds after the open is over before the
spec's next action, every time, and the spec never exercises it.

On 2026-11-08 `chat-drawer-touch.spec.ts` failed in CI shard 3 (run
42518025991, a playlist-only PR) with the wheel scroll undone: distance from
the bottom `0`, expected `> 100`. `ChatMessageList` opens a 300 ms "resize
window" on every ResizeObserver report, including the observer's first
report when the list mounts. A scroll inside the window, while the list is
pinned, was read as a resize clamp and snapped back to the tail before the
viewer's wheel or touch input was checked. In the CI trace the hover found
the list stable at once and the wheel landed about 245 ms after the drawer
opened. Locally the hover always saw the drawer still moving, backed off, and
wheeled about 900 ms later: 40 runs of 40 passed. Under CPU load (14 busy
loops, 2 workers) the hover sometimes found the list stable early, and the
spec failed 1 run in 30 with the CI message. A probe that moved the mouse
without the hover's wait, or grew a row just before the wheel, failed every
time a wheel reached the list.

Rules:

- When a spec passes locally and fails in CI on something that depends on
  how long after an event the next action lands, read the action's log in
  both traces (`"type":"log"` entries for its `callId`: "element is not
  stable", "waiting 500ms"). If the local run backs off and CI's does not,
  the two runs are testing different timings.
- Do not rely on the actionability wait to place an action. When the
  behaviour under test has a time window, open the window on purpose in the
  spec (here, `shiftLayout()` grows a row and waits two animation frames so
  the ResizeObserver report has been delivered) and act inside it.
- Check "it stays put" by triggering the thing that would move it, not with
  `waitForTimeout`. A sleep with no event in it proves nothing; a second
  `shiftLayout()` is what a wrongly armed pin would react to.
- A window that is armed by every ResizeObserver report is armed on every
  mount. Real input (touch, wheel) must be checked before such a window, or
  the viewer's first scroll after opening the view is swallowed.
