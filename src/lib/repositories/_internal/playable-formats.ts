/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PLAYABLE_FORMAT_TYPE } from '@/lib/utils/playable-format';

import { digitalFormatWhere } from './digital-format-where';
import { allOf } from './where-kit';

import type { Prisma } from '@prisma/client';

/** The playable format, not withdrawn (`deletedAt` null or absent). */
export const playableFormatWhere = allOf(
  { formatType: PLAYABLE_FORMAT_TYPE },
  digitalFormatWhere.active
) satisfies Prisma.ReleaseDigitalFormatWhereInput;

/**
 * The only way a public read loads a release's formats: any projection,
 * limited to the active playable format. Until 2026-10-04 the release page
 * and the artist page loaded every format with every file, and every
 * non-MP3 file was signed into a 24-hour CloudFront URL in an anonymous,
 * shared-cached payload — paid content around the download gate. Reads
 * that legitimately load every format (admin, deletion, the buyer's own
 * collection) are listed with their reasons in `playable-formats.spec.ts`,
 * which fails on any other full load. Proved by
 * `public-formats.contract.spec.ts`.
 */
export const playableFormats = <A extends Omit<Prisma.Release$digitalFormatsArgs, 'where'>>(
  args: A
): A & { where: typeof playableFormatWhere } => ({ ...args, where: playableFormatWhere });
