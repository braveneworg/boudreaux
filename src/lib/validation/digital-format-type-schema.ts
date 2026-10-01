/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { VALID_FORMAT_TYPES, type DigitalFormatType } from '@/lib/constants/digital-formats';

/**
 * Schema for a {@link DigitalFormatType} discriminator returned by the digital
 * format API routes. Kept in sync with `FORMAT_SIZE_LIMITS` keys via the
 * `satisfies` guard below.
 */
export const digitalFormatTypeSchema = z.enum(
  VALID_FORMAT_TYPES
) satisfies z.ZodType<DigitalFormatType>;
