/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Platform } from './shared';

/**
 * Hand-written mirror of the Prisma `Url` model's scalar fields (no relations
 * loaded). Drift-checked in artist-repository where `urls: true` is used.
 */
export interface UrlRecord {
  id: string;
  artistId: string | null;
  releaseId: string | null;
  platform: Platform;
  url: string;
}
