/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ReleaseService } from '@/lib/services/release-service';

import type { Prisma } from '@prisma/client';

export type GetReleasesParams = {
  skip?: number;
  take?: number;
  search?: string | null;
};

/**
 * Repository helper to fetch releases via the ReleaseService.
 */
export async function getReleases(params: GetReleasesParams) {
  return ReleaseService.getReleases(params);
}

/**
 * Repository helper to create a release via the ReleaseService.
 */
export async function createRelease(input: Prisma.ReleaseCreateInput) {
  return ReleaseService.createRelease(input);
}
