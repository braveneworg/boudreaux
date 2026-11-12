# ffmpeg does not detect a playlist that has lost its extension

**What happened (2026-11-11).** The re-encode Lambda refuses an HLS playlist
or a concat script uploaded as "media": those demuxers read a text file that
names other files to open, which is how an upload reaches a file or a host
its uploader should not (ADR-0026). The Lambda saves every upload under a
name it chooses, `upload`, with no extension. With that name ffmpeg's HLS
demuxer does not recognise a playlist at all, so the refusal could not rely
on ffprobe reporting `format_name: hls`. The file fails to open as anything,
and what says why is ffprobe's stderr.

**The rule.** Refusing a dangerous container needs more than one check, and
each has to be tested against a real file under the name the code really
uses:

- `-protocol_whitelist file` and `-format_whitelist <containers>` on every
  ffprobe and ffmpeg run, before `-i`;
- the reported `format_name` against the same list of containers;
- for a file that would not open, ffprobe's stderr (`not on whitelist`,
  `m3u8`, `hls`) to tell "unsupported" from "unreadable".

**How to apply.**

- Keep the integration specs that feed the real ffmpeg an `.m3u8`-style
  playlist and a concat script pointing at a local file, and assert nothing
  is stored. Removing `-format_whitelist` must fail them; it does, on the
  concat case.
- A newer ffmpeg may word its error differently. The file is still refused,
  as unreadable instead of unsupported. Check the wording when the pinned
  ffmpeg image is moved.
- Never pass ffmpeg a URL or a name taken from the upload.
