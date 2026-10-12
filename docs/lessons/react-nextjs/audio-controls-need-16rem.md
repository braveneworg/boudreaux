# The audio controls need 16rem; a narrower player box overflows

`videojs-audio.css` gives `.video-js` `min-width: calc(20rem - 4rem)`, so the
audio control bar is never narrower than 16rem (256px). The release player
frames the cover, the controls and the ticker as one box, and the cover's
width sets that box. Size the box below 16rem and the controls stick out of
its right edge while the cover and ticker stay inside.

It surfaced on 2026-10-11 while sizing the spotlight's phone sheet (#862).
The player width was `min(100%, 90dvh - 20rem)`, which fits a 375×667 screen
with a 276px cover. At 320×568 the same rule gave a 187px cover, and
`getBoundingClientRect` on `.video-js` read 256px wide inside a 191px frame.

Rules:

- Any rule that shrinks the release player's box needs a 16.25rem floor
  (16rem of controls plus the frame's 2px borders), as `ReleasePlayDialog`'s
  `PHONE_SHEET_PLAYER_CLASS` does with `max(16.25rem, …)`.
- Check a shrinking layout at the smallest screen it can reach (320px wide),
  not only at the target size, and measure `.video-js` against its frame.
