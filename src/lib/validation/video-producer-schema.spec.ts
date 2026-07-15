/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { videoProducerSchema } from './video-producer-schema';

it('accepts an existing producer with id + name', () => {
  expect(videoProducerSchema.safeParse({ id: 'p1', name: 'Rick' }).success).toBe(true);
});

it('accepts a new producer with name only', () => {
  expect(videoProducerSchema.safeParse({ name: 'New' }).success).toBe(true);
});

it('rejects an empty name', () => {
  expect(videoProducerSchema.safeParse({ name: '' }).success).toBe(false);
});

it('rejects a name that exceeds 200 characters', () => {
  expect(videoProducerSchema.safeParse({ name: 'a'.repeat(201) }).success).toBe(false);
});

it('trims whitespace from the name', () => {
  const result = videoProducerSchema.safeParse({ name: '  Rick  ' });
  expect(result.success).toBe(true);
  expect((result as { success: true; data: { name: string } }).data.name).toBe('Rick');
});

it('allows the id field to be absent (new producer)', () => {
  const result = videoProducerSchema.safeParse({ name: 'Studio Producer' });
  expect(result.success).toBe(true);
  expect((result as { success: true; data: { id?: string } }).data.id).toBeUndefined();
});
