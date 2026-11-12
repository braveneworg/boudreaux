/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One presigned `PUT` from the browser, with upload progress and cancel.
 * `fetch` reports neither, which is why this uses `XMLHttpRequest`. Client
 * only.
 */

const ABORT_NAME = 'AbortError';

export interface PutWithProgressOptions {
  /** Sent as `Content-Type`, exactly: a presigned URL signs it. */
  contentType: string;
  /** Called with the fraction uploaded, from 0 to 1. */
  onProgress?: (fraction: number) => void;
  /** Aborts the request when it fires. */
  signal?: AbortSignal;
}

const abortError = (): Error => {
  const error = new Error('The upload was cancelled.');
  error.name = ABORT_NAME;
  return error;
};

/** Whether a rejection from {@link putWithProgress} is a cancel, not a failure. */
export const isUploadAbort = (error: unknown): boolean =>
  error instanceof Error && error.name === ABORT_NAME;

/**
 * `PUT` a body to a URL. Resolves on a 2xx; rejects with a message written
 * for the user on a refusal or a dropped connection, and with an abort (see
 * {@link isUploadAbort}) when the signal fires.
 */
export const putWithProgress = (
  url: string,
  body: Blob,
  { contentType, onProgress, signal }: PutWithProgressOptions
): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', contentType);

    request.upload.addEventListener('progress', ({ lengthComputable, loaded, total }) => {
      if (lengthComputable && total > 0) {
        onProgress?.(loaded / total);
      }
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error(`The upload was refused (${request.status}).`));
      }
    });
    request.addEventListener('error', () => {
      reject(new Error('The upload did not finish. Check your connection.'));
    });
    request.addEventListener('abort', () => {
      reject(abortError());
    });

    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    signal?.addEventListener('abort', () => request.abort(), { once: true });
    request.send(body);
  });
