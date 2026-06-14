/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { VALID_FORMAT_TYPES } from '@/lib/constants/digital-formats';

import { digitalFormatTypeSchema } from './digital-format-type-schema';

describe('digitalFormatTypeSchema', () => {
  it.each(VALID_FORMAT_TYPES)('accepts the valid format type %s', (formatType) => {
    expect(digitalFormatTypeSchema.parse(formatType)).toBe(formatType);
  });

  it('rejects a format type outside the allowed set', () => {
    expect(() => digitalFormatTypeSchema.parse('MP3_128KBPS')).toThrow();
  });

  it('rejects a non-string value', () => {
    expect(() => digitalFormatTypeSchema.parse(123)).toThrow();
  });
});
