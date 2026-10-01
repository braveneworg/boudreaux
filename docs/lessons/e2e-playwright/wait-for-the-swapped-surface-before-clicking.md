# Wait for the swapped surface before clicking its trigger

A component that picks its surface from `useIsMobile` renders the desktop
surface on the server and swaps to the mobile one in an effect after
hydration. `ResponsiveLightbox` does this: the server sends the dialog's
trigger, and at a phone width the drawer's trigger replaces it once the page
has measured the viewport. The two triggers are the same button under two
parents, so React removes one and mounts the other.

A spec that clicks straight after `page.goto` can click the button that is
about to be removed. Playwright reports the click as done, nothing opens, and
the assertion on the dialog times out.

On 2026-09-29 `artist-page.spec.ts` "tapping the photo slides a drawer up from
the bottom" failed this way in 7 of 12 runs of 35 specs with 4 workers, and in
2 of 24 runs on its own. The traces agreed in every failure: the click began
341 to 375 ms after navigation, before the first client request (360 to
395 ms). In the passing run it began at 787 ms. The spec had passed in CI and
in every earlier local run.

Rules:

- Before clicking a trigger on a surface that is swapped after hydration,
  wait for the marker of the surface the test expects. The shadcn triggers
  carry one: `data-slot="drawer-trigger"` or `data-slot="dialog-trigger"`.

  ```ts
  await expect(photo).toHaveAttribute('data-slot', 'drawer-trigger');
  await photo.click();
  ```

- Do not retry the click in a `toPass` loop. A second click on a surface that
  did open closes it.
- A failure where the action succeeds and nothing happens is a lost event.
  Read the trace's timeline before the spec: compare the time of the click
  with the time of the first request the client code sends.
- To reproduce a race like this, run the one test with
  `--workers=4 --repeat-each=24 --retries=0 --trace=retain-on-failure`. It
  takes under a minute.
