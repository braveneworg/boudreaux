# ADR-0028: A submission report does not record who filed it

- **Status**: Accepted
- **Date**: 2026-11-12

## Context

ADR-0025 makes a submission report the way anyone tells the label a
submission is wrong, and says a report changes nothing by itself. The person
wronged may not be a user of the site: the person in a photo, the writer of
a song someone else posted. So a report needs no account.

The chat abuse report, the nearest thing the site has, stores the reporter's
account id and a fingerprint hash on every row "for rate limiting and audit",
and never shows either. Its rate limits do not read those columns; they read
a rate limiter. A submission report's note is free text an approver reads,
and a manager is an approver.

## Decision

**A submission report stores what was said and nothing about who said it.
The only personal data on it is a contact email its reporter chose to
leave.**

- **No account id and no fingerprint are stored**, for a signed-in reporter
  or a guest. The reporter's key (the account, else the visitor fingerprint
  hash) lives in the rate limiter for 24 hours and nowhere else.
- **The contact email is optional, read by admins only, and erased 90 days
  after the report was filed.** A manager sees that one was left.
- **A notice never carries what a reporter typed.** It names the
  submission's title and the reason; the note and the contact email stay on
  the site, behind the approver section.
- **An approver who cannot decide on a submission cannot read its reports.**
  A manager is not shown the reports against their own submission, since a
  note can name its reporter. An admin is shown all of them.
- **Abuse of the report control is bounded, not traced.** One report per
  reporter per submission and five per reporter per day; three notices per
  submission per day; fifty open reports per submission; Turnstile on every
  one.

## Alternatives rejected

- **Store the reporter as the chat abuse report does.** It allows a serial
  false reporter to be found and banned, but nothing reads the columns, a
  guest's fingerprint identifies nobody an admin could act on, and a table
  of who complained about whom is a liability the feature does not need.
- **Require an account to report.** It would make reporters traceable and
  turn away exactly the people a takedown path exists for.
- **Show the contact email to every approver.** Whoever reviews could then
  reply, but a stranger's address would be open to every manager ever
  appointed.
- **Keep the contact email with the report.** No erasure to run, and an
  address held for as long as its submission exists.

## Consequences

- An admin cannot tell who filed a report, or that two reports came from one
  person, unless the reporter says so. A harassing reporter is slowed by the
  limits and cannot be singled out.
- A reporter who left no email cannot be asked anything.
- A reply to a reporter comes from an admin's own mail; the site sends none.
- After 90 days a report reads as one with no contact left, and a late reply
  is no longer possible.
- If tracing ever becomes necessary it can be added for new reports only;
  nothing recovers it for the ones already filed.
