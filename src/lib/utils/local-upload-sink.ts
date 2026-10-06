/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The E2E upload sink's address, shared by the server adapter
 * (`upload-local-adapter.ts`) and the key extractor, which also runs in the
 * browser. The sink stands in for S3 and the CDN only in E2E mode.
 */
export const LOCAL_UPLOAD_SINK_PATH = '/api/test-harness/upload-sink';

const isE2EMode = (): boolean =>
  process.env.E2E_MODE === 'true' || process.env.NEXT_PUBLIC_E2E_MODE === 'true';

/** The S3 key a local upload-sink URL stands for; null for any other URL or outside E2E. */
export const localSinkKey = (url: string): string | null => {
  if (!isE2EMode()) return null;
  try {
    const parsed = new URL(url);
    return parsed.pathname === LOCAL_UPLOAD_SINK_PATH ? parsed.searchParams.get('key') : null;
  } catch {
    return null;
  }
};
