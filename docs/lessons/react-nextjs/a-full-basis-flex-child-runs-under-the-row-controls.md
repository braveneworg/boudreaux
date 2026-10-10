# A `basis-full` child of a wrapping row runs under the row's controls

On 2026-10-10 the contact link row of the artist form gained a description
input "on its own line, as wide as the row's input area". The row is
`flex flex-wrap`: a label input, a URL input, then the move and remove
buttons. The description was given `order-last basis-full`. The component
specs passed, since they see names and DOM order and never a box, and the
change was committed.

The first look at the page showed the description's right edge 88px past the
URL input's, under the buttons. Every other input in the fieldset ended on
one edge.

The fix makes the row a grid from `md` up,
`md:grid-cols-[calc(100%/3)_minmax(0,1fr)_auto]`. Those tracks give the label
and the URL the widths the flex line gave them (`basis-1/3` and `flex-1`),
and the description spans the first two. `order-last` still places it after
the buttons while it stays before them in the DOM, so the tab order is label,
URL, description, buttons.

Rules:

- "Its own line" in a wrapping flex row is the whole row, the controls
  column included. When a new line must align with some of the items above
  it, give the row tracks: a grid whose percentage and `fr` columns
  reproduce the flex sizes.
- Look at the page, or measure the boxes in an E2E spec, before committing
  a layout class. `admin-artist-links.spec.ts` now measures this row at a
  desktop and a phone width.
- `order` moves a flex or grid item on screen and leaves the tab order as
  the DOM has it. Use it only when that keyboard order is what the spec
  asks for.
