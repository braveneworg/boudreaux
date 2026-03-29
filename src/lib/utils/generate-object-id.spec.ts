/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';

import { generateObjectId } from './generate-object-id';
import { isValidObjectId } from './validation/object-id';

describe('generateObjectId', () => {
  it('should return a 24-character string', () => {
    expect(generateObjectId()).toHaveLength(24);
  });

  it('should return a valid MongoDB ObjectId format', () => {
    expect(isValidObjectId(generateObjectId())).toBe(true);
  });

  it('should return lowercase hex characters only', () => {
    expect(/^[a-f0-9]{24}$/.test(generateObjectId())).toBe(true);
  });

  it('should return unique values across multiple calls', () => {
    const ids = Array.from({ length: 10 }, () => generateObjectId());
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(10);
  });
});
