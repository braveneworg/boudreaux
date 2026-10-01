/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { PassThrough } from 'node:stream';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { DOWNLOAD_LIMIT, downloadLimiter } from '@/lib/config/rate-limit-tiers';
import type { FreeFormatType } from '@/lib/constants/digital-formats';
import { withAuth } from '@/lib/decorators/with-auth';
import { extractClientIp } from '@/lib/decorators/with-rate-limit';
import { downloadGate } from '@/lib/services/download-gate/download-gate';
import type { Deliverable, DownloadRequest } from '@/lib/services/download-gate/types';
import { PlaylistService } from '@/lib/services/playlist-service';
import type {
  PlaylistDownloadManifest,
  PlaylistDownloadTrack,
} from '@/lib/services/playlist-service';
import { buildContentDisposition } from '@/lib/utils/content-disposition';
import { downloadRefusal } from '@/lib/utils/download-outcome-response';
import { loggers } from '@/lib/utils/logger';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import {
  createStoreArchive,
  issuePrefetch,
  startBufferPrefetch,
  type ZipArchive,
} from '@/lib/utils/zip-stream';
import { playlistDownloadQuerySchema } from '@/lib/validation/playlist-schema';

/** Allow up to 5 minutes for large playlists (matches the bundle route). */
export const maxDuration = 300;
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

/**
 * Playlists stream at a shallower prefetch depth than release bundles (8):
 * MP3/AAC tracks are small and playlists can be long-lived requests, so 4
 * bounds peak memory while still hiding S3 latency.
 */
const PLAYLIST_PREFETCH_DEPTH = 4;

// Rate limiting — skipped in E2E test mode to avoid 429s during test runs,
// matching the sibling release-format download route.
const enforceDownloadRateLimit = async (ip: string): Promise<NextResponse | null> => {
  if (process.env.E2E_MODE === 'true') {
    return null;
  }
  try {
    await downloadLimiter.check(DOWNLOAD_LIMIT, ip);
    return null;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
      { status: 429, headers: NO_STORE_HEADERS }
    );
  }
};

/** Either the fully-resolved download inputs or an early response to return verbatim. */
type DownloadSetup =
  | {
      kind: 'ok';
      manifest: PlaylistDownloadManifest;
      format: FreeFormatType;
      respondPreflight: boolean;
      playlistId: string;
    }
  | { kind: 'response'; response: NextResponse };

/**
 * Rate-limit, validate the playlist id + `format` query, and resolve the
 * download manifest (owner-or-public — missing, private-unowned, and
 * malformed ids all answer the detail route's 404 shape).
 */
const resolvePlaylistDownload = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  userId: string
): Promise<DownloadSetup> => {
  const rateLimited = await enforceDownloadRateLimit(extractClientIp(request));
  if (rateLimited) return { kind: 'response', response: rateLimited };

  const { id: playlistId } = await context.params;
  if (!isValidObjectId(playlistId)) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'NOT_FOUND' },
        { status: 404, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const parsed = playlistDownloadQuerySchema.safeParse({
    format: request.nextUrl.searchParams.get('format'),
  });
  if (!parsed.success) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'INVALID_FORMAT' },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const respondPreflight = request.nextUrl.searchParams.get('respond') === 'preflight';
  const manifest = await PlaylistService.getDownloadManifest(
    playlistId,
    userId,
    parsed.data.format
  );
  if (!manifest) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'NOT_FOUND' },
        { status: 404, headers: NO_STORE_HEADERS }
      ),
    };
  }
  if (!respondPreflight && manifest.tracks.length === 0) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'NO_TRACKS' },
        { status: 404, headers: NO_STORE_HEADERS }
      ),
    };
  }
  return { kind: 'ok', manifest, format: parsed.data.format, respondPreflight, playlistId };
};

/** One gate request per distinct release in the manifest, all in the one format. */
const gateRequests = (
  userId: string,
  manifest: PlaylistDownloadManifest,
  format: FreeFormatType
): DownloadRequest[] =>
  manifest.distinctReleaseIds.map((releaseId) => ({
    subject: { kind: 'user', userId },
    releaseId,
    formats: [format],
  }));

/**
 * Preflight: every release decided by the gate, nothing locked or charged.
 * A refusal answers 403 with the gate's error code (the dialog reads `ok`
 * and the status), a missing release 404.
 */
const preflightResponse = async (
  requests: DownloadRequest[],
  manifest: PlaylistDownloadManifest
): Promise<NextResponse> => {
  const results = await downloadGate.checkMany(requests);
  const refused = results.find((result) => result.kind !== 'grant');
  if (refused !== undefined) {
    const { status, body } =
      refused.kind === 'not-found'
        ? downloadRefusal({ ok: false, denial: null, reason: 'NOT_FOUND' })
        : downloadRefusal({ ok: false, denial: refused });
    return NextResponse.json(
      { ok: false, reason: body.error },
      { status, headers: NO_STORE_HEADERS }
    );
  }
  return NextResponse.json(
    { ok: true, trackCount: manifest.tracks.length, skippedCount: manifest.skippedCount },
    { status: 200, headers: NO_STORE_HEADERS }
  );
};

/**
 * Peek the first prefetched body, coalescing a rejection (e.g. S3 NoSuchKey)
 * to null so the quota is not charged for a download that delivers nothing;
 * the drive below aborts the archive mid-stream on a failed body.
 */
const peekFirstBuffer = async (
  inFlight: ReadonlyArray<Promise<Buffer | null>>
): Promise<Buffer | null> => {
  const [first] = inFlight;
  if (first === undefined) return null;
  try {
    return await first;
  } catch {
    return null;
  }
};

/** The archive plus the PassThrough the response body actually reads from. */
interface ArchivePipeline {
  archive: ZipArchive;
  responsePass: PassThrough;
}

/**
 * Drain the prefetched buffers into the archive in playlist order, refilling
 * the pipeline as it advances. Runs detached so the Response streams while
 * bytes are produced; errors abort the archive and terminate the body — the
 * zip is left without its end-of-central-directory record, so the client
 * sees a corrupt/incomplete archive, never a silent success.
 */
const drivePlaylistArchive = (
  { archive, responsePass }: ArchivePipeline,
  tracks: readonly PlaylistDownloadTrack[],
  prefetch: {
    inFlight: Array<Promise<Buffer | null>>;
    keys: readonly string[];
    s3Client: ReturnType<typeof getS3Client>;
    bucket: string;
  }
): void => {
  void (async () => {
    try {
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks.at(i);
        if (track === undefined) continue;
        const buffer = await prefetch.inFlight.at(i);
        const nextIndex = i + PLAYLIST_PREFETCH_DEPTH;
        const nextKey = prefetch.keys.at(nextIndex);
        if (nextIndex < tracks.length && nextKey !== undefined) {
          prefetch.inFlight.push(issuePrefetch(prefetch.s3Client, prefetch.bucket, nextKey));
        }
        if (buffer === null || buffer === undefined) continue;
        archive.append(buffer, { name: track.entryName });
      }
      archive.finalize();
    } catch (driveError) {
      loggers.downloads.error('Playlist zip drive error', driveError);
      archive.abort();
      // archiver quirk: abort() with a queued-but-never-started task skips its
      // internal shutdown, so the archive never emits 'end'. End the response
      // PassThrough ourselves so the body always terminates (a second end()
      // from archiver's own shutdown is a no-op).
      if (!responsePass.destroyed) responsePass.end();
    }
  })();
};

/**
 * Build the archive → PassThrough pipeline (mirrors the bundle route: the
 * response reads the PassThrough, never the archiver Transform directly, so
 * the drive's error path can terminate the body deterministically).
 */
const createArchivePipeline = (): ArchivePipeline => {
  const archive = createStoreArchive();
  const responsePass = new PassThrough();
  archive.pipe(responsePass);
  // pipe() does not forward errors — without this, an archiver error would
  // crash the process instead of erroring the response body.
  archive.on('error', (err) => {
    if (!responsePass.destroyed) responsePass.destroy(err);
  });
  return { archive, responsePass };
};

/** Adapt the response PassThrough into a web stream; cancel aborts the archive. */
const toWebStream = ({ archive, responsePass }: ArchivePipeline): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      responsePass.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      responsePass.on('end', () => controller.close());
      responsePass.on('error', (err) => controller.error(err));
    },
    cancel() {
      if (!responsePass.destroyed) responsePass.destroy();
      archive.abort();
    },
  });

class NothingToDeliverError extends Error {
  constructor() {
    super('No track body could be fetched for the playlist');
    this.name = 'NothingToDeliverError';
  }
}

/**
 * The deliverable: a zip of every track, streamed. Resolves only once the
 * FIRST track body is actually in hand, so the gate's charge lands after
 * something exists to deliver; an all-failing fetch throws instead of
 * shipping an empty zip.
 */
const producePlaylistZip = async (manifest: PlaylistDownloadManifest): Promise<Deliverable> => {
  const s3Client = getS3Client();
  const bucket = getS3BucketName();
  const keys = manifest.tracks.map(({ s3Key }) => s3Key);
  const inFlight = startBufferPrefetch(s3Client, bucket, keys, PLAYLIST_PREFETCH_DEPTH);
  const firstBuffer = await peekFirstBuffer(inFlight);
  if (firstBuffer === null) {
    throw new NothingToDeliverError();
  }

  const pipeline = createArchivePipeline();
  drivePlaylistArchive(pipeline, manifest.tracks, { inFlight, keys, s3Client, bucket });

  // Collapse whitespace runs (incl. CR/LF/tabs, which the title schema's
  // end-only trim lets through) to a single space FIRST, so no control char
  // survives into the Content-Disposition header value — a raw CR/LF makes
  // undici's Headers throw "invalid header value" → a hard 500 on download.
  const safeTitle =
    manifest.playlistTitle
      .replace(/\s+/g, ' ')
      .replace(/[^\w .-]/g, '')
      .trim() || 'playlist';
  const response = new NextResponse(toWebStream(pipeline), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': buildContentDisposition(`${safeTitle}.zip`),
      ...NO_STORE_HEADERS,
      'X-Accel-Buffering': 'no',
    },
  });
  return { kind: 'stream', response };
};

/**
 * GET /api/playlists/[id]/download?format=MP3_320KBPS|AAC[&respond=preflight]
 *
 * Zip the playlist's track items in the requested free format (videos and
 * unresolvable items are skipped). An adapter over the download gate
 * (ADR-0018): every distinct release is decided as one all-or-nothing set —
 * free formats all count alike — and charged once the first track body is
 * in hand. Preflight reports counts (or the refusal) without downloading.
 */
export const GET = withAuth<{ id: string }>(
  async (request, context, session): Promise<NextResponse> => {
    try {
      const setup = await resolvePlaylistDownload(request, context, session.user.id);
      if (setup.kind === 'response') return setup.response;
      const { manifest, format, respondPreflight } = setup;
      const requests = gateRequests(session.user.id, manifest, format);

      if (respondPreflight) {
        return await preflightResponse(requests, manifest);
      }

      const outcome = await downloadGate.downloadMany(
        requests,
        () => producePlaylistZip(manifest),
        {
          ipAddress: request.headers.get('x-forwarded-for') ?? 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        }
      );
      if (!outcome.ok) {
        const { status, body } = downloadRefusal(
          outcome.denial === null
            ? { ok: false, denial: null, reason: outcome.reason }
            : { ok: false, denial: outcome.denial }
        );
        return NextResponse.json(
          { ok: false, reason: body.error, errorCode: body.error, message: body.message },
          { status, headers: NO_STORE_HEADERS }
        );
      }
      if (outcome.deliverable.kind !== 'stream') {
        throw new Error('playlist download produced a non-stream deliverable');
      }
      return outcome.deliverable.response;
    } catch (error) {
      loggers.downloads.error('Playlist download error', error);
      return NextResponse.json(
        { error: error instanceof NothingToDeliverError ? 'STREAM_FAILED' : 'INTERNAL_ERROR' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }
  }
);
