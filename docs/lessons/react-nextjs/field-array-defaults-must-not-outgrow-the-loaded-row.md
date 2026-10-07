# A field-array default the loaded row shrinks leaves ghost rows

React Hook Form keeps the values of inputs that unmount (`shouldUnregister`
is `false` by default). When a form's `defaultValues` seed a `useFieldArray`
with more rows than the record later loaded by `reset(values)` holds, the
extra rows' inputs mount first, register, and then unmount as the array
shrinks — but their entries linger in the form values as `undefined`
objects. The next submit hands the resolver an array with a hole, and Zod
rejects it ("expected string, received undefined" on
`contactLinkGroups.1.heading`) for a row the admin cannot see.

On 2026-10-06 the artist form's create-mode defaults were given the three
link arrays, Booking and Merch prefilled, so a save in the moment between
a create and the loaded edit form could never drop a link. Every unit spec
passed. The E2E "clearing every link stores no composite" then failed
deterministically: that artist has one contact group, the defaults had two,
and Save died on the ghost second group with no toast to say so.

Rules:

- Seed a field array in `defaultValues` only with what every record will
  hold, or with nothing. Prefill through the values the record loads with
  (`toArtistLinksFormValues` on the loaded row), never through defaults a
  `reset` may shrink.
- When a save must survive missing arrays, make the server tolerant (the
  update action composes `links` from whatever arrays arrive, the missing
  ones as empty) rather than forcing the client to always send them.
- A save that produces neither a success nor an error toast, with the
  browser console showing "Form validation errors" for an index the page
  does not render, is this ghost row. Run the E2E that loads a record with
  fewer rows than the defaults.
