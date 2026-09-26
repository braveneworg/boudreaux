# Jina Reader returns a bot wall as a successful page

The first production run of "Generate images" (2026-09-26) against
`https://imginn.com/davideramos/` reported "No new images found on those
pages." The page has dozens of photos. What the Lambda actually received from
`r.jina.ai` was HTTP 200 with a rendered Cloudflare interstitial: title
`Just a moment...`, body "Performing security verification", one image (the
favicon, dropped by the junk filter), and a `warning` field saying the page
"maybe requiring CAPTCHA". `readUrl` treated it as a read page with zero
photos, so the job succeeded with nothing and the admin was told the page was
empty.

Facts worth keeping:

- Jina Reader does not bypass anti-bot protection, by stated policy
  (<https://jina.ai/reader/>, FAQ "Does Reader actively bypass website
  anti-bot protection?" — "No"). `X-Engine: browser`, `X-No-Cache`, and an
  API key do not change the outcome for a Cloudflare-challenged host;
  `X-Proxy: auto` needs a key and only changes geography, not bot detection.
- A challenged read looks like success at every layer: `response.ok`, non-empty
  `content`, an `images` map. Only `data.title`, `data.warning`, and the
  interstitial copy reveal it. `readUrlOutcome` in `bio-generator/src/jina.ts`
  classifies these as `blocked`; the images-from-links job turns an all-blocked
  run into `ok: false` with the host named, so the admin sees
  "imginn.com blocked automated access (bot check)" instead of an empty result.
- Sites like imginn (an Instagram mirror) also serve their images through a
  signed, expiring proxy (`s12.imginn.com/...?oh=…&oe=…`) and paginate with an
  AJAX cursor, all behind the same wall. Getting the HTML is only the first of
  three fences; do not estimate "just scrape it" from the browser view.

**How to apply:** when a scrape "finds nothing", check the Lambda's
`jina_read_blocked` events (CloudWatch group `/aws/lambda/fakefour-bio-generator`)
before touching the image filters. Pulling images from a Cloudflare-protected
host needs a different fetch path (a scraping provider that handles bot
challenges, or the admin saving the photos from their own browser), not a Jina
header.
