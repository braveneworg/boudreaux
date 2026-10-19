/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { resolve } from 'node:path';

import type { BrowserContext } from '@playwright/test';

/**
 * Answer every request to the production CDN with a local PNG. The `load`
 * event waits on images, so a stalled CDN image holds `page.goto` past its
 * timeout: the live CDN did exactly that in CI run 2601.
 */
const routeCdn = async (context: BrowserContext): Promise<void> => {
  await context.route('https://cdn.fakefourrecords.com/**', (route) =>
    route.fulfill({ path: resolve('public/icons/icon-192.png'), contentType: 'image/png' })
  );
};

export { routeCdn };
