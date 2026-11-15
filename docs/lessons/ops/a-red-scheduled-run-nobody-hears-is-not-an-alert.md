# A red scheduled run nobody hears about is not an alert

**What happened (2026-11-10 to 2026-11-15).** The daily Redis keepalive went
red on 2026-11-10 and stayed red for six runs. Production's `/api/health`
said `redis: unavailable` the whole time. Nobody acted until the user asked
why the keepalive was failing.

Two things in the workflow hid it:

- Its only notice was GitHub's own email for a failed scheduled run. That
  goes to the account that last edited the workflow's `cron`, and only when
  that account has Actions notifications turned on. Nothing in the
  repository can check or enforce either.
- The script printed "PING request failed (HTTP error or timeout)" for every
  cause. It ran `curl -f … 2>/dev/null`, which throws away the HTTP status,
  the response body, and curl's exit code. A deleted database, a rotated
  token and a spent quota read the same, so the log could not say what to
  fix. The repository secrets had not changed since 2026-09-13, which put
  the change on Upstash's side, and that was as far as the log went.

**The rule.** A scheduled check sends its own alert, to an address held in a
secret, and the alert says what failed. "GitHub emails the author" is not a
delivery path.

**How to apply.**

- `scripts/ci/send-alert-email.sh "<subject>" "<body>"` mails `ALERT_EMAIL`
  through SES. Call it from an `if: failure()` step, as
  `redis-keepalive.yml` does. `uptime-check.yml` still relies on GitHub's
  notice.
- Keep curl's exit code and `%{http_code}` and print them. Discard curl's
  stderr when the URL is a secret: it names the host, and GitHub masks only
  the whole secret, not the host inside it.
- A step that fails writes a one-line `reason` to `GITHUB_OUTPUT`; the alert
  step reads it through `env`, never through `${{ }}` inside `run`.
- `gh run list --workflow <file> --limit 30` shows when a schedule turned
  red. Read it before the newest log.
