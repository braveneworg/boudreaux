/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { tourCreateSchema, tourQuerySchema, tourUpdateSchema } from './tour-schema';

describe('tour-schema', () => {
  describe('tourCreateSchema', () => {
    it('validates a complete valid payload', () => {
      const validTour = {
        title: 'Summer Tour 2026',
        subtitle: 'West Coast Edition',
        subtitle2: 'Special Guests TBA',
        description: 'Join us for an incredible summer tour',
        notes: 'Internal notes',
        createdBy: 'user-123',
      };

      const result = tourCreateSchema.safeParse(validTour);
      expect(result.success).toBe(true);
    });

    it('validates with only required field', () => {
      const minimalTour = {
        title: 'Minimal Tour',
      };

      const result = tourCreateSchema.safeParse(minimalTour);
      expect(result.success).toBe(true);
    });

    it('rejects payload without title', () => {
      const result = tourCreateSchema.safeParse({ subtitle: 'No title' });
      expect(result.success).toBe(false);
    });

    it('rejects title over 200 chars', () => {
      const result = tourCreateSchema.safeParse({ title: 'A'.repeat(201) });
      expect(result.success).toBe(false);
    });

    it('rejects subtitle over 150 chars', () => {
      const result = tourCreateSchema.safeParse({
        title: 'Valid Title',
        subtitle: 'B'.repeat(151),
      });
      expect(result.success).toBe(false);
    });

    it('rejects subtitle2 over 150 chars', () => {
      const result = tourCreateSchema.safeParse({
        title: 'Valid Title',
        subtitle2: 'B'.repeat(151),
      });
      expect(result.success).toBe(false);
    });

    it('rejects description over 5000 chars', () => {
      const result = tourCreateSchema.safeParse({
        title: 'Valid Title',
        description: 'C'.repeat(5001),
      });
      expect(result.success).toBe(false);
    });

    it('rejects notes over 2000 chars', () => {
      const result = tourCreateSchema.safeParse({
        title: 'Valid Title',
        notes: 'D'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('tourUpdateSchema', () => {
    it('validates partial update', () => {
      const result = tourUpdateSchema.safeParse({
        title: 'Updated Title',
        subtitle: 'Updated Subtitle',
      });
      expect(result.success).toBe(true);
    });

    it('allows empty payload', () => {
      const result = tourUpdateSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects empty title', () => {
      const result = tourUpdateSchema.safeParse({ title: '' });
      expect(result.success).toBe(false);
    });

    it('rejects title over 200 chars', () => {
      const result = tourUpdateSchema.safeParse({ title: 'A'.repeat(201) });
      expect(result.success).toBe(false);
    });

    it('rejects notes over 2000 chars', () => {
      const result = tourUpdateSchema.safeParse({ notes: 'N'.repeat(2001) });
      expect(result.success).toBe(false);
    });
  });

  describe('tourQuerySchema', () => {
    it('applies default page and limit', () => {
      const result = tourQuerySchema.parse({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });

    it('coerces page and limit strings', () => {
      const result = tourQuerySchema.parse({ page: '2', limit: '25' });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(25);
    });

    it('rejects page below 1', () => {
      const result = tourQuerySchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects limit above 100', () => {
      const result = tourQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });
  });
});
