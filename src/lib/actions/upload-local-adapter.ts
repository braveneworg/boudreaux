/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { LOCAL_UPLOAD_SINK_PATH } from '@/lib/utils/local-upload-sink';

/**
 * E2E stand-in for single-PUT presigned uploads, the counterpart of
 * `multipart-local-adapters.ts`. Under `E2E_MODE` the presign action hands
 * out a same-origin sink URL instead of signing an S3 PUT; the sink keeps the
 * bytes in memory and serves them back at the object's URL. Image, poster
 * and frame uploads then run in E2E with no bucket and no credentials, and
 * what they upload renders. Never active outside `E2E_MODE`: the sink route
 * 404s.
 */

/** Only object keys the presign action builds (`media/<entity>/<id>/…`). */
const isMediaKey = (key: string): boolean => key.startsWith('media/') && !key.includes('..');

interface LocalObject {
  body: ArrayBuffer;
  contentType: string;
}

const globalForLocalUploads = globalThis as unknown as {
  boudreauxLocalUploads?: Map<string, LocalObject>;
};

// On globalThis so dev-server module reloads keep what was uploaded.
const objects: Map<string, LocalObject> = (globalForLocalUploads.boudreauxLocalUploads ??=
  new Map());

export const isLocalUpload = (): boolean => process.env.E2E_MODE === 'true';

/**
 * The object's sink URL: the browser PUTs to it and it serves the object, so
 * it stands in for both the presigned URL and the CDN URL. Absolute, as a
 * real presigned URL is, because the uploader parses it with `new URL()`.
 */
export const localObjectUrl = (s3Key: string): string =>
  `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}${LOCAL_UPLOAD_SINK_PATH}?key=${encodeURIComponent(s3Key)}`;

/** Store an uploaded object; false when the key is not a media key. */
export const localStoreObject = (s3Key: string, object: LocalObject): boolean => {
  if (!isMediaKey(s3Key)) return false;
  objects.set(s3Key, object);
  return true;
};

export const localReadObject = (s3Key: string): LocalObject | null => objects.get(s3Key) ?? null;
