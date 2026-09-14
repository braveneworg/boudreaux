# Read the server action before wiring a client "resolve" to it

PR #707 wired the enrichment panel's release-date auto-apply to resolve its
suggestion server-side by calling `applyVideoSuggestion({ op: 'apply' })` —
the same mutation as the explicit Apply button. But
`apply-video-suggestion-action.ts` rejected EVERY video-level field
(`releasedOn`, `description`, `featuredArtist`) with "This suggestion applies
in the edit form, not on the server", and the mutation hook turned that into
`toast.error`. So from #707 until 2026-09-14 every enrichment auto-apply
filled the form correctly and then showed an error toast, with the suggestion
left `pending` — exactly the re-apply-on-every-visit bug #707 set out to fix.

Three specs passed the whole time: the hook spec asserted `onResolve` was
called (a mock), the panel spec asserted the mutation was called with
`op: 'apply'` (a mock), and the action spec asserted the rejection (the real
behaviour). Each layer was tested in isolation against a contract the next
layer did not honour.

Rules:

- Before wiring a client call to a server action, READ the action's branch
  for that input and cite the line in the PR — never infer the contract
  from the hook's JSDoc or the button that already uses it.
- When a client mock's expected call (`op: 'apply'` for `releasedOn`) is the
  exact input another spec asserts the server REJECTS, one of the two is
  wrong; grep the action spec for the same input before merging.
- A "resolve" that only flips status is a distinct server branch from an
  "apply" that writes data. Name it, test it, and make the action's JSDoc
  list which fields take which path.
