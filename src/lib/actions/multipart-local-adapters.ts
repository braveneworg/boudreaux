/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { createHash, randomUUID } from 'node:crypto';

/**
 * Local stand-ins for the five things a multipart video upload genuinely
 * cannot do without AWS: create the upload, sign a part URL, take delivery of
 * a part, assemble the parts, and discard them — plus the HEAD that confirms
 * the assembled object exists.
 *
 * These sit as low as the seam allows: at the four multipart Server Actions,
 * which are the lowest substitution point still reachable from the browser.
 * Everything above them runs for real on the fake path — the client uploader
 * really initiates, really presigns just-in-time batches, really PUTs each
 * slice over its XHR worker pool, really collects ETags, and really completes
 * — because the fake hands back the same shapes the real S3 path does rather
 * than skipping ahead to a finished result. The actions' own admin gate, Zod
 * validation, and key guard all still run in front of it.
 *
 * Nothing here is reachable in production: the selection is gated on
 * `E2E_MODE`, and the sink route that receives the part bodies 404s unless the
 * same flag is set.
 */

/**
 * Where the browser PUTs part bodies while there is no S3 to PUT them to.
 *
 * Deliberately not under an `/api/e2e/` segment: the vitest projects exclude
 * `**\/e2e/**` (the Playwright directory), which would silently drop the sink's
 * own unit spec from every run.
 */
export const LOCAL_PART_SINK_PATH = '/api/test-harness/multipart-sink';

interface LocalPart {
  /** Quoted MD5 hex, exactly the shape S3 returns in the part's ETag header. */
  eTag: string;
  size: number;
}

interface LocalUpload {
  s3Key: string;
  parts: Map<number, LocalPart>;
}

interface LocalMultipartStore {
  /** In-flight uploads, keyed by the upload id `localStartUpload` minted. */
  uploads: Map<string, LocalUpload>;
  /** Assembled objects, keyed by S3 key, valued by their byte size. */
  objects: Map<string, number>;
}

/**
 * SHARED-STATE ASSUMPTION: the sink route that takes delivery of the part
 * bodies and the Server Actions that start and finish the upload run in ONE
 * server process, so a module-level map is enough to carry a part's byte count
 * from its PUT through to `complete` (which must report the assembled object's
 * authoritative size) and on to the confirm-time existence check. E2E runs a
 * single `next dev` / standalone server, so that holds.
 *
 * The store hangs off `globalThis` rather than being a plain module constant so
 * a dev-server module re-evaluation, or a second instance of this module in a
 * different bundle, still resolves to the same maps.
 *
 * If the assumption ever breaks, it breaks LOUDLY rather than silently:
 * `localCompleteUpload` throws on an upload id it does not recognise instead of
 * inventing a size, and the sink route 409s on one. A cross-process split would
 * surface as an immediate, named upload failure in the E2E run — never as a
 * video row quietly persisted with a wrong `fileSize`.
 */
const globalForLocalMultipart = globalThis as unknown as {
  boudreauxLocalMultipart?: LocalMultipartStore;
};

const store: LocalMultipartStore = (globalForLocalMultipart.boudreauxLocalMultipart ??= {
  uploads: new Map(),
  objects: new Map(),
});

/** True when there is no AWS to upload to — the E2E harness. */
export const isLocalMultipartUpload = (): boolean => process.env.E2E_MODE === 'true';

/**
 * Begin an upload and return its id. Mirrors `CreateMultipartUpload`: the id is
 * opaque and unguessable, which is also what keeps the sink route from being
 * drivable by anyone who did not go through the admin-gated initiate action.
 */
export const localStartUpload = ({ s3Key }: { s3Key: string }): string => {
  const uploadId = `e2e-${randomUUID()}`;
  store.uploads.set(uploadId, { s3Key, parts: new Map() });
  return uploadId;
};

/**
 * The URL the browser should PUT a part to.
 *
 * Same-origin and relative, where the real one is an absolute presigned S3 URL:
 * a cross-origin fake would need CORS on the sink, and the S3 signature is the
 * one part of the URL that carries no meaning without AWS. Everything the
 * uploader does with the URL — cache it per part, re-request it after a 403,
 * hand it to `XMLHttpRequest.open` — is unchanged.
 */
export const localPartUploadUrl = ({
  uploadId,
  partNumber,
}: {
  uploadId: string;
  partNumber: number;
}): string =>
  `${LOCAL_PART_SINK_PATH}?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`;

/**
 * Take delivery of one part body, returning the ETag the sink should echo back
 * in its response header, or `null` when the upload id is unknown (aborted,
 * already completed, or never issued).
 *
 * Only the body's length and digest are kept — the bytes themselves are
 * discarded, since nothing in the flow ever reads them back.
 */
export const localRecordPart = ({
  uploadId,
  partNumber,
  body,
}: {
  uploadId: string;
  partNumber: number;
  body: Uint8Array;
}): string | null => {
  const upload = store.uploads.get(uploadId);
  if (!upload) return null;
  const eTag = `"${createHash('md5').update(body).digest('hex')}"`;
  upload.parts.set(partNumber, { eTag, size: body.byteLength });
  return eTag;
};

/**
 * Verify every listed part was delivered under the ETag the client claims, and
 * total their sizes. Throws on any mismatch — S3 rejects a `CompleteMultipartUpload`
 * with a bad part list too, and a silent pass here would hand back a wrong
 * `fileSize`.
 */
const assembleSize = (
  upload: LocalUpload,
  parts: ReadonlyArray<{ partNumber: number; eTag: string }>
): number => {
  let total = 0;
  for (const { partNumber, eTag } of parts) {
    const recorded = upload.parts.get(partNumber);
    if (!recorded) {
      throw new Error(`Local multipart upload: part ${partNumber} was never uploaded`);
    }
    if (recorded.eTag !== eTag) {
      throw new Error(`Local multipart upload: ETag mismatch for part ${partNumber}`);
    }
    total += recorded.size;
  }
  return total;
};

/**
 * Assemble the delivered parts into an object and return its authoritative
 * size — the local answer to `CompleteMultipartUpload` + `HeadObject`. The
 * upload id is consumed, so a replay fails the same way a replayed S3 complete
 * would.
 */
export const localCompleteUpload = ({
  s3Key,
  uploadId,
  parts,
}: {
  s3Key: string;
  uploadId: string;
  parts: ReadonlyArray<{ partNumber: number; eTag: string }>;
}): number => {
  const upload = store.uploads.get(uploadId);
  if (!upload) {
    throw new Error(`Local multipart upload: unknown upload id ${uploadId}`);
  }
  if (upload.s3Key !== s3Key) {
    throw new Error('Local multipart upload: key does not match the upload it was started for');
  }
  const fileSize = assembleSize(upload, parts);
  store.uploads.delete(uploadId);
  store.objects.set(s3Key, fileSize);
  return fileSize;
};

/** Discard an in-flight upload and its parts. Unknown ids are ignored, as in S3. */
export const localAbortUpload = (uploadId: string): void => {
  store.uploads.delete(uploadId);
};

/**
 * The local answer to the confirm-time `HeadObject`: true only for a key whose
 * upload actually completed. A create that never uploaded still fails the
 * check, which is the whole point of replacing the old blanket skip.
 */
export const localObjectExists = (s3Key: string): boolean => store.objects.has(s3Key);
