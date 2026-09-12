# Never put the OAuth callback behind a strict per-IP rate zone

`/api/auth/callback/<provider>` sat for five months behind
`zone=auth` (5 r/min per IP, burst 2), a NextAuth-era block whose other path
names (`signin`, `verify-request`, `signout`) do not exist in better-auth. The
"aggressive brute-force limiter" therefore throttled exactly one thing: the
OAuth callback — a browser redirect a legitimate user cannot retry. Apple's
`form_post` callback costs TWO hits (better-auth answers the POST with a 302
to the same URL as GET), so Google-then-Apple inside a minute, or a
link + unlink cycle, produced a bare nginx 429 and both providers "broke"
(2026-09-12). It surfaced only when the deferred 4-provider prod smoke ran
several sign-ins per minute.

- Rate-limit auth abuse where it actually enters: magic-link email sending is
  a server action with its own limiter + Turnstile; better-auth's built-in
  limiter caps `/sign-in*` and `/sign-up*` at 3 per 10 s. The callback needs
  only the general `/api/` zone plus the one-shot `state` cookie.
- After an auth-library migration, grep nginx for the OLD library's paths — a
  location regex that matches nothing still looks like protection.
- CI E2E never goes through nginx and `nginx -t` cannot run outside Docker
  (`proxy_pass http://website:3000`, `/run/secrets/ssl_*`), so routing rules
  are proven only by `nginx/nginx.conf.spec.ts` and a prod smoke. Keep that
  spec's resolver in step with any new `location` modifier you introduce.
