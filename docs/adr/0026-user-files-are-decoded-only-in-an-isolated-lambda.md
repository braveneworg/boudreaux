# ADR-0026: User files are decoded only in an isolated Lambda

- **Status**: Accepted
- **Date**: 2026-11-11

## Context

Submissions carry attachments uploaded by any signed-in user: video, audio
and images. Every attachment is re-encoded, so that what is served is a
fresh file written from the decoded picture and sound and nothing else from
the upload. Re-encoding is not a scan. It also means a decoder has to parse a
file a stranger built, and malformed media that attacks the decoder is the
usual exploit.

The app container already ships ffmpeg and runs ffprobe on admin-uploaded
videos, and `sharp` already runs there on images fetched for artist bios.
That container also holds every production secret and serves all web traffic
from one host.

## Decision

**A user's file is decoded only in a dedicated re-encode Lambda, run through
the job runner. The app never decodes one, for any kind of attachment.**

- **One Lambda handles video, audio and images.** Its permissions are to
  read one upload and write one re-encoded copy.
- **It follows the async job lifecycle**: signed callbacks, progress, the
  stale window, and the local adapter for development and E2E.
- **Only the re-encoded copy is reviewed or served.** The uploaded original
  never gets a public URL and is deleted once its re-encode succeeds or
  fails.
- **A file that fails to re-encode is refused.** A submission cannot be
  published while any attachment lacks its re-encoded copy.
- **Limits are on the upload; the kept copy is smaller by construction.** A
  photo up to 20 MB is kept at most 2560 px on its long side at quality 70;
  audio up to 50 MB is kept in one standard format; a video up to 500 MB and
  ten minutes is kept at 720p.
- **The card picture's video frame is captured in the same run.**

## Alternatives rejected

- **Re-encode in the app container.** No new infrastructure, since ffmpeg is
  already installed, but a stranger's file is decoded beside the app's
  secrets and a transcode competes with page requests for CPU.
- **AWS MediaConvert.** Managed and robust on odd inputs, but billed per
  minute, more to set up, and it does not handle images.
- **A virus scanner in place of re-encoding.** It answers a different
  question: it looks for known signatures and leaves the file as uploaded.

## Consequences

- Attachments are asynchronous: an upload is not usable until its job
  succeeds, and the form shows that state.
- A second Lambda to build, deploy and monitor alongside the bio generator.
- Admin-uploaded Videos are still probed in the app container. Those files
  come from admins, not the public; this decision does not move them.
- Large uploads are held briefly: at the caps of ten attachments and five
  unapproved submissions, one account can have up to 25 GB in transit.
