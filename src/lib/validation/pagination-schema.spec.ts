/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { paginatedResponseSchema } from './pagination-schema';

const rowSchema = z.object({ id: z.string() });
const pageSchema = paginatedResponseSchema(rowSchema);

describe('paginatedResponseSchema', () => {
  it('parses a page with rows and a numeric nextSkip cursor', () => {
    expect(pageSchema.parse({ rows: [{ id: 'a' }], nextSkip: 24 })).toEqual({
      rows: [{ id: 'a' }],
      nextSkip: 24,
    });
  });

  it('parses the final page with a null nextSkip', () => {
    expect(pageSchema.parse({ rows: [], nextSkip: null })).toEqual({ rows: [], nextSkip: null });
  });

  it('rejects a page missing the nextSkip cursor', () => {
    expect(() => pageSchema.parse({ rows: [] })).toThrow();
  });

  it('rejects a page whose rows are not an array', () => {
    expect(() => pageSchema.parse({ rows: 'nope', nextSkip: null })).toThrow();
  });

  it('rejects a row that fails the row schema', () => {
    expect(() => pageSchema.parse({ rows: [{ id: 1 }], nextSkip: null })).toThrow();
  });
});
