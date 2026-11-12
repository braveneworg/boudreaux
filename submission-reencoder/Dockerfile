# The submission re-encode Lambda (ADR-0026): the bundled handler, `sharp`, and
# a static ffmpeg + ffprobe.
#
# Build context: this directory, after `pnpm run build` has written `dist/`.
# `sam build` runs this with `--platform linux/arm64` (see template.yaml).

# Static ffmpeg and ffprobe, pinned by digest: a tag can be moved, a digest
# cannot. This is the multi-arch index of mwader/static-ffmpeg:8.1.1, resolved
# with `docker buildx imagetools inspect mwader/static-ffmpeg:8.1.1`. To move
# to a newer ffmpeg, resolve the new tag the same way and replace both.
FROM mwader/static-ffmpeg:8.1.1@sha256:735f84b905e00d5c618b667f0b053f83b1096f5fc404c607e6134bf2275a0e0a AS ffmpeg

# `sharp` and its native binary for this image's platform, from the lockfile.
FROM public.ecr.aws/lambda/nodejs:24 AS dependencies
WORKDIR /build/submission-reencoder
COPY dist/pnpm-version ./
RUN npm install --global "pnpm@$(cat pnpm-version)" && pnpm --version
# The lockfile names the wire contract as `file:../packages/job-contract`, and
# pnpm reads it before installing anything. It is bundled into the handler, so
# it is needed here only to be found, and is not copied to the final stage.
COPY dist/job-contract /build/packages/job-contract
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --prod: everything else the handler imports is already inside the bundle.
RUN pnpm install --prod --frozen-lockfile

FROM public.ecr.aws/lambda/nodejs:24
# /usr/local/bin is on the Lambda runtime's PATH; the handler runs them by name.
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
COPY --from=dependencies /build/submission-reencoder/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY dist/handler.cjs ${LAMBDA_TASK_ROOT}/

CMD ["handler.lambdaHandler"]
