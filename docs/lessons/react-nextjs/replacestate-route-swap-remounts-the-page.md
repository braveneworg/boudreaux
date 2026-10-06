# A `replaceState` to another route remounts the page at the next refresh

Next's app router patches `history.replaceState`. A native call with a new
URL updates the router's canonical URL (so `usePathname` follows), but keeps
the rendered tree. The next time the router fetches a tree, it fetches it
for that URL.

A server action that calls `revalidatePath` does exactly that: its response
carries the tree of the current URL. If that URL now belongs to another page
segment, React unmounts the old page and mounts the new one. Every bit of
client state below the shared layout is lost.

## The case

The video uploader creates a draft and swaps `/admin/videos/new` to
`/admin/videos/<id>` with `history.replaceState`, so a reload resumes the
draft. The release-date autosave, which revalidates `/admin/videos`, then
posted from the edit URL. Its response rendered `[videoId]/page.tsx` in place
of `new/page.tsx`, and `VideoForm` remounted in edit mode.

- The remount came a few seconds after every new upload, on the dev server
  and on the production build.
- It dropped a title typed after the swap, a manual poster uploaded in that
  window, and a second file pick.
- Some of those runs made no separate `?_rsc` request, so a test that waits
  for a "refresh" request can miss it. The tree arrives inline in the
  action's response.

## Rules

- **Host the state in a shared layout.** When a page swaps its URL to a
  sibling route with `replaceState`, put the stateful component in a layout
  shared by both routes, not in the pages. A layout survives a child segment
  change.
- **Decide when to remount.** The host keeps the instance when the new
  segment is the one the component itself moved to, and remounts it for any
  other segment. See `src/app/admin/videos/(editor)/layout.tsx`,
  `video-editor-host.tsx` and `video-editor-instance.ts`.
- **Test the outcome.** Wait for the revalidating action to finish, then
  check that state from after the swap survived. That is
  `admin-video-draft-upload.spec.ts` "the form survives the refresh that
  follows the draft".
