# Video posters have no `_w{width}` variants — the loader must pass them through

The global `next/image` loader (`src/lib/image-loader.ts` →
`buildCdnImageVariantUrl`) rewrites every CDN `src` into a `_w{width}.webp`
variant. Only cover-art and bio uploads run the variant generator; video
poster frames (`media/videos/<id>/poster-*.jpg|png`, captured at upload) are
stored as a single file. Rendering a `posterUrl` through a plain `<Image>`
therefore requests `poster-…_w40.webp`, which 403s on the CDN and shows a
broken image — the create-playlist search results, staged creator items, and
playlist cover tiles all did this (2026-09-12) while `video-card.tsx` had
worked around it with `unoptimized`.

Fix lives in the loader: `/media/videos/` is a single-variant path marker
(alongside `/bio/thumbs/`) in `build-cdn-image-variant-url.ts`, so every
poster `<Image>` gets the stored URL unchanged. When a new asset class is
added, decide up front whether the variant generator covers it; if not, add
its path marker there rather than sprinkling `unoptimized`.
