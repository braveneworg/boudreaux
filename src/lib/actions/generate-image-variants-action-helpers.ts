/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

interface S3DownloadResponse {
  Body?: unknown;
  ContentLength?: number;
}

type S3BufferResult = { success: true; buffer: Buffer } | { success: false; error: string };

/**
 * Drain an S3 `GetObject` response body into a single `Buffer`, enforcing a
 * byte ceiling both up-front (via `ContentLength`, when present) and per-chunk
 * (for responses with no length header). Mirrors the prior inline streaming
 * loop exactly, including the empty-body and over-limit error messages.
 *
 * @param response - The `GetObjectCommand` output (`Body` + optional length).
 * @param maxBytes - Inclusive size ceiling; exceeding it returns an error.
 */
export const collectS3ObjectBuffer = async (
  response: S3DownloadResponse,
  maxBytes: number
): Promise<S3BufferResult> => {
  const stream = response.Body;
  const contentLength = response.ContentLength;
  const limitError = `Source image exceeds ${maxBytes / (1024 * 1024)}MB limit`;

  if (!stream) {
    return { success: false, error: 'Empty response body from S3' };
  }

  if (typeof contentLength === 'number' && contentLength > maxBytes) {
    return { success: false, error: limitError };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) {
      return { success: false, error: limitError };
    }
    chunks.push(chunk);
  }

  return { success: true, buffer: Buffer.concat(chunks) };
};
