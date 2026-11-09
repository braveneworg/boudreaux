/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { readActionInput, readPreGeneratedId } from './read-action-input';

const schema = z.object({
  title: z.string().min(1, { message: 'Title is required' }),
  notes: z.string().optional(),
  position: z.number().optional(),
  featured: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  credits: z.array(z.object({ name: z.string() })).optional(),
  createdBy: z.string().optional(),
});

type Form = z.infer<typeof schema>;

const PERMITTED = ['title', 'notes', 'position', 'featured', 'tags', 'credits'] as const;

const read = (input: unknown, blankStrings: 'omit' | 'keep' = 'omit') =>
  readActionInput<Form>(input, PERMITTED, schema, { blankStrings });

describe('readActionInput', () => {
  it('parses the permitted fields with their types intact', () => {
    const { parsed } = read({
      title: '1999',
      position: 3,
      featured: false,
      tags: ['001', '7.99'],
      credits: [{ name: 'Ann' }],
    });

    expect(parsed).toEqual({
      success: true,
      data: {
        title: '1999',
        position: 3,
        featured: false,
        tags: ['001', '7.99'],
        credits: [{ name: 'Ann' }],
      },
    });
  });

  // `createdBy` is in the schema but must never be client-settable.
  it('drops a schema field the action does not permit', () => {
    const { parsed } = read({ title: 'A', createdBy: 'attacker' });

    expect(parsed.data).toEqual({ title: 'A' });
  });

  it('drops a key that is in neither the schema nor the permitted list', () => {
    const { parsed } = read({ title: 'A', role: 'admin' });

    expect(parsed.data).toEqual({ title: 'A' });
  });

  it('drops undefined and null values', () => {
    const { parsed } = read({ title: 'A', notes: undefined, position: null });

    expect(parsed.data).toEqual({ title: 'A' });
  });

  it('keeps an empty array', () => {
    const { parsed } = read({ title: 'A', tags: [] });

    expect(parsed.data).toEqual({ title: 'A', tags: [] });
  });

  it('keeps a string that only looks like a JSON array', () => {
    const { parsed } = read({ title: '[1, 2]' });

    expect(parsed.data).toEqual({ title: '[1, 2]' });
  });

  describe("with blankStrings 'omit' (create)", () => {
    it('drops an empty string, as if the field was not sent', () => {
      const { parsed } = read({ title: 'A', notes: '' }, 'omit');

      expect(parsed.data).toEqual({ title: 'A' });
    });

    it('keeps a whitespace-only string', () => {
      const { parsed } = read({ title: 'A', notes: ' ' }, 'omit');

      expect(parsed.data).toEqual({ title: 'A', notes: ' ' });
    });

    it('fails a required field sent blank as missing', () => {
      const { parsed } = read({ title: '' }, 'omit');

      expect(parsed.error?.issues.map(({ path }) => path)).toEqual([['title']]);
    });
  });

  describe("with blankStrings 'keep' (update)", () => {
    it('keeps an empty string so the action can clear the field', () => {
      const { parsed } = read({ title: 'A', notes: '' }, 'keep');

      expect(parsed.data).toEqual({ title: 'A', notes: '' });
    });
  });

  it.each([
    ['null', null],
    ['an array', [{ title: 'A' }]],
    ['a string', 'title=A'],
  ])('reads %s as an empty input', (_label, input) => {
    const { parsed } = read(input);

    expect(parsed.error?.issues.map(({ path }) => path)).toEqual([['title']]);
  });

  it('reports a field of the wrong type as invalid instead of coercing it', () => {
    const { parsed } = read({ title: 'A', position: '3' });

    expect(parsed.error?.issues.map(({ path }) => path)).toEqual([['position']]);
  });

  it('starts the form state unsubmitted, with no fields or errors', () => {
    const { formState } = read({ title: 'A' });

    expect(formState).toEqual({ errors: {}, fields: {}, success: false, hasTimeout: false });
  });
});

describe('readPreGeneratedId', () => {
  const ID = '507f1f77bcf86cd799439011';

  it('returns a valid ObjectId', () => {
    expect(readPreGeneratedId({ preGeneratedId: ID })).toBe(ID);
  });

  it.each([
    ['an invalid id', { preGeneratedId: 'not-an-id' }],
    ['a non-string id', { preGeneratedId: 42 }],
    ['no id', {}],
    ['a non-object input', null],
  ])('returns undefined for %s', (_label, input) => {
    expect(readPreGeneratedId(input)).toBeUndefined();
  });
});
