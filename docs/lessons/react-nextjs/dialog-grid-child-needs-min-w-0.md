# A DialogContent child needs `min-w-0` or its rows widen the dialog

`DialogContent` is a CSS grid (`grid … max-w-[calc(100%-2rem)] sm:max-w-lg`).
Grid items default to `min-width: auto`, so a child whose intrinsic
min-content width exceeds the dialog (a search-result row: icon + thumb +
`whitespace-nowrap` title + pill + duration + two icon buttons) widens the
grid track past the dialog's own box. `overflow-y-auto` on the dialog then
clips everything on the right — row actions, the Save button, even the Title
input — instead of the rows truncating. It surfaced on phone widths in the
create-playlist dialog once a query returned Songs AND Videos (2026-09-12).

Put `min-w-0` on the component's root element when it is rendered as a
direct DialogContent child (`PlaylistCreator`'s `<section>`). Regression net:
`playlist-add-from-player.spec.ts` "keeps mixed song + video search results
inside the create dialog" — at a 390px viewport it asserts no descendant
extends past the dialog's right edge and `scrollWidth <= clientWidth`.

It happened again in `ReleasePlayDialog` (#872, 2026-10-14). The share and
footer slots had `min-w-0`, but the player slot did not. The player's info
ticker draws track, artist and release as one `whitespace-nowrap` line, and
a long one ("Thank Plath (prod. by Smoke M2D6) • by Ceschi • Bring Us The
Head Of Francisco False (Part 2)") widened the grid track. The dialog's
`overflow-y-auto` then cut off the frame, the seek bar and the ticker on the
right. Every direct DialogContent child needs `min-w-0`, not only the ones
that looked wide when they were written. Regression net:
`home-spotlight-grid.spec.ts` "fits the whole player in the modal at …"
(serves the long titles through `page.route` and asserts
`scrollWidth <= clientWidth` from 1440×900 down to 375×667) and "keeps the
controls inside the frame on a 320×568 phone".
