/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { bioGenerationInputSchema } from './types.js';

describe('bioGenerationInputSchema', () => {
  it('parses valid input without optional date fields', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
    });
    expect(result.success).toBe(true);
  });

  it('parses valid input with all three optional date fields', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
      bornOn: '1965-03-15',
      diedOn: '2020-11-01',
      formedOn: '1990-06-01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bornOn).toBe('1965-03-15');
      expect(result.data.diedOn).toBe('2020-11-01');
      expect(result.data.formedOn).toBe('1990-06-01');
    }
  });

  it('rejects bornOn with a year-only value (not YYYY-MM-DD)', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
      bornOn: '1949',
    });
    expect(result.success).toBe(false);
  });

  it('rejects diedOn with a slash-separated value', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
      diedOn: '2020/11/01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects formedOn with a partial (two-digit year) value', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
      formedOn: '90-06-01',
    });
    expect(result.success).toBe(false);
  });
});
