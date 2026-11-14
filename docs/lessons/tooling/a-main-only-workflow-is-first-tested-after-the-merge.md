# A workflow that runs only on main is first tested after the merge

**What happened (2026-11-12).** `deploy-submission-reencoder.yml` runs on a
push to main. Its image build had only ever run on an arm64 laptop whose
Docker uses the `overlay2` store. The first run on main, minutes after #946
merged, failed in `sam build`:

```
Step 10/13 : COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
failed to export image: NotFound: content digest sha256:0b36a82e…: not found
```

The digest is the x86-64 manifest of `public.ecr.aws/lambda/nodejs:24`. The
runner is x86-64, its Docker (29.4) uses the containerd image store, and
`sam build` drives Docker's classic builder. Building the arm64 image, the
classic builder pulled only the arm64 half of the base image, then at
`COPY --from` went looking for the runner's own half. The pull request had
been green throughout: nothing in CI built the image.

**The rule.** Whatever a main-only workflow builds has to be built by a
pull-request job too, with the same steps. Put those steps in one composite
action and call it from both.

**How to apply.**

- `.github/actions/build-reencoder-image` is that action. `ci.yml` runs it in
  the `reencoder-image` job on pull requests, and the deploy runs it before
  it touches AWS.
- Build a container image for another architecture with BuildKit:
  `sam build --use-buildkit`. SAM adds `--provenance=false` itself, which
  Lambda needs, since it refuses an image index.
- A local build proves little about a runner. Compare `docker info` on both:
  the storage driver (`overlay2` or `overlayfs`) and the architecture.
- When a deploy step cannot run before the merge (it needs the deploy role),
  say so in the pull request as untested, and read the first run on main.
