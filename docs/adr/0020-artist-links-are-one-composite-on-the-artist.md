# ADR-0020: Artist links are one composite on the artist

- **Status**: Accepted; amended 2026-10-10 (a contact link carries a
  description)
- **Date**: 2026-10-06

## Context

The redesigned artist page has a ledger of links under the collage: the
artist's websites, their social media, and a contact column of
admin-defined groups such as Booking or Merch. Each link is a label and a
URL, and the page shows the label beside the link. Admins curate these on
the edit form; nothing generates them.

The schema already has three things that look like links and none of them
fits:

- `Url` / `ArtistUrl` rows carry a `Platform` enum. The page needs no
  platform: the icon follows from the href, and a stored platform drifts
  from the URL it was meant to describe (a Bandcamp link filed as
  `WEBSITE`). The enum also has no room for a label, an email or a phone
  number.
- `ArtistBioLink` rows are what a bio generation job discovered: reference
  links and image sources, owned by the job and replaced on regeneration.
  A curated link is a human's, and survives regeneration as display images
  do ([ADR-0008](0008-display-images-are-chosen-by-humans-and-survive-regeneration.md)).
- The private `Artist.email` and `Artist.phone` are the label's own contact
  details and are never shown.

## Decision

**An artist's curated links are one composite field, `Artist.links`, in
three sections, read only on the artist's own page.**

- **One composite, three sections.** `ArtistLinks { websites: ArtistLink[];
social: ArtistLink[]; contact: ArtistLinkGroup[] }`, where an
  `ArtistLink` is `{ label?: string; url: string }` and an `ArtistLinkGroup`
  is `{ heading: string; links: ArtistLink[] }`. Websites and Social Media
  are flat lists. Contact & Misc holds admin-defined groups; the editor
  prefills Booking and Merch headings, which are not saved while empty.
  The field is optional: an artist with no links has `links` absent (read
  as `null`), and a section an older document lacks reads as `[]`.
- **Written whole, in order.** A save replaces the composite; the order
  the admin arranges is the order the page shows. There is no row id, so
  nothing merges.
- **Schemes by section.** Websites and Social Media accept `http(s)` URLs
  only (`isHttpUrl`). Contact also accepts an email, stored as
  `mailto:<address>`, and a phone number, stored as `tel:+<digits>`:
  separators are stripped and the result must match `^\+?\d{7,15}$`; an
  email with `?`, `#`, `&` or `%` is refused, so no header can be injected
  into the `mailto:` href. Anything else is rejected on save, and every
  href is checked again at render; one that fails is not rendered as a link.
- **No stored platform.** The icon on a link derives from its href at
  render: a brand icon by dot-boundary host match (as listening-service
  detection already does), `Mail` for `mailto:`, `Phone` for `tel:`, else
  `Globe`. A host nobody recognises still renders, with the generic icon.
- **Own page only.** `links` joins the artist's own-page projection with
  the bio: the public artist read carries it, and the projections reached
  through another record (a release credit, a band member or band, a tour
  headliner) omit it, as they omit the bio
  ([ADR-0016](0016-an-artist-is-public-whether-or-not-it-is-still-on-the-label.md)).
- **Edited as three arrays.** The form holds `websiteLinks`, `socialLinks`
  and `contactLinkGroups`; the Server Action composes `links` from them
  (an object does not survive the form-data encoding) and the service
  normalises: labels and headings through the bio text sanitiser, contact
  hrefs into their stored form. The editors exist in edit mode only, as the
  image manager does.
- **No product caps.** How many links an artist has is the admin's call.
  The request carries generous size guards against a runaway payload,
  documented as guards, not as rules.

## Alternatives rejected

- **`Url` / `ArtistUrl` / `Platform`.** A platform enum the page does not
  read, no label, no `mailto:`/`tel:`, and a join table for what is a list
  on one document.
- **A new `ArtistLink` model.** Rows need ids and a sort column to keep an
  order the composite keeps for free, and every read becomes a join for a
  list the page always wants whole.
- **A `Json` column.** Prisma would type nothing; the sections, the
  optional label and the group shape would live only in Zod.
- **Reusing `ArtistBioLink`.** It is the job's output and is cleared and
  rewritten by regeneration; mixing in human rows means a role flag and a
  regeneration guard on every write.

## Consequences

- `prisma/schema.prisma` gains three composite types and one optional field
  on `Artist`; the deploy's schema push creates nothing, since a composite
  is only a document shape. The contract spec pins what Mongo returns for
  an absent field and a missing list.
- A link's icon can change when the host it points at changes its domain;
  nothing stored goes stale.
- The release page and the artists index do not show links; they are the
  page artist's, like the bio.

## Amendment (2026-10-10): a contact link carries a description

A link in Contact & Misc may now say what it is for: "Books North American
tours" under the label "Agent". Every rule above stands; one shape changes.

- **A fourth composite type.** An `ArtistContactLink` is an `ArtistLink`
  with an optional `description`:
  `{ label?: string; description?: string; url: string }`. The `links` of an
  `ArtistLinkGroup` are now `ArtistContactLink[]`. `ArtistLink` itself is
  unchanged.
- **Contact & Misc only.** Websites and Social Media links stay `ArtistLink`
  and store no `description`, not even a `null`. Their form schema does not
  name the field, so one sent on such a link is stripped, and their rows on
  the page are one ledger line with no place for it.
- **Optional, and no migration.** A contact link stored before this
  amendment has no `description` in its document and reads as `null`; the
  contract spec pins that. Nothing is backfilled. A link may have a
  description without a label.
- **Plain text, sanitised like the label.** The service runs the
  `description` through the bio text sanitiser on every write and stores an
  empty result as `null`. The form refuses more than 280 characters, a
  request-size guard like the label's 120.
- **Where it renders.** Only on the artist's own page, in Contact & Misc,
  between the label and the link: the label in semibold (on every contact
  row, with or without a description), the description under it in normal
  weight and wrapping, then the link, all on the label's left edge. The
  editor has a single-line description input under each contact row's label
  and URL.

A `description` on the shared `ArtistLink` was rejected: every website and
social link would carry a `null` that nothing reads, and the form already
keeps a separate schema for a contact row.
