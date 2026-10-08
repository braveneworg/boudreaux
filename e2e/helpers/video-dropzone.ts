/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect } from '@playwright/test';

import type { Page } from '@playwright/test';

/** An in-memory file for `setInputFiles`. */
export interface VideoFilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * Pick a file on the video dropzone, scoped so the poster input can't win.
 * Waits for the dropzone's hydration marker first: `page.goto` resolves at
 * `load`, which lands before React attaches the input's change handler on
 * a production build, and a file set in that gap is silently lost (the
 * upload never starts; `docs/lessons/e2e-playwright/
 * wait-for-the-dropzone-to-hydrate-before-setting-a-file.md`).
 */
export const pickVideoFile = async (page: Page, file: VideoFilePayload): Promise<void> => {
  const dropzone = page.getByTestId('video-dropzone');
  await expect(dropzone).toHaveAttribute('data-hydrated', 'true');
  await dropzone.locator('input[type="file"]').setInputFiles(file);
};
