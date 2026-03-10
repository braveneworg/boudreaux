/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { venueCreateSchema, venueUpdateSchema, venueQuerySchema } from './venue-schema';

const expectFailureIssuePath = (
  result: ReturnType<typeof venueCreateSchema.safeParse>,
  expectedPath: string
) => {
  expect(result.success).toBe(false);
  if (result.success) {
    throw new Error('Expected schema parsing to fail');
  }

  expect(result.error.issues[0].path).toContain(expectedPath);
};

describe('venue-schema', () => {
  describe('venueCreateSchema', () => {
    it('should validate a complete valid venue creation payload', () => {
      const validVenue = {
        name: 'The Grand Theater',
        address: '123 Main Street',
        city: 'Los Angeles',
        state: 'CA',
        country: 'USA',
        postalCode: '90001',
        capacity: 5000,
        notes: 'Historic venue with great acoustics',
      };

      const result = venueCreateSchema.safeParse(validVenue);
      expect(result.success).toBe(true);
    });

    it('should validate with only required fields', () => {
      const minimalVenue = {
        name: 'Small Venue',
        city: 'Portland',
      };

      const result = venueCreateSchema.safeParse(minimalVenue);
      expect(result.success).toBe(true);
    });

    it('should reject venue without name', () => {
      const invalidVenue = {
        city: 'Seattle',
      };

      const result = venueCreateSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
      expectFailureIssuePath(result, 'name');
    });

    it('should reject venue without city', () => {
      const invalidVenue = {
        name: 'The Grand Theater',
      };

      const result = venueCreateSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
      expectFailureIssuePath(result, 'city');
    });

    it('should reject name exceeding 200 characters', () => {
      const invalidVenue = {
        name: 'A'.repeat(201),
        city: 'Los Angeles',
      };

      const result = venueCreateSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
      expectFailureIssuePath(result, 'name');
    });

    it('should reject address exceeding 500 characters', () => {
      const invalidVenue = {
        name: 'The Grand Theater',
        address: 'B'.repeat(501),
        city: 'Los Angeles',
      };

      const result = venueCreateSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
      expectFailureIssuePath(result, 'address');
    });

    it('should reject city exceeding 100 characters', () => {
      const invalidVenue = {
        name: 'The Grand Theater',
        city: 'C'.repeat(101),
      };

      const result = venueCreateSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
      expectFailureIssuePath(result, 'city');
    });

    it('should reject state exceeding 100 characters', () => {
      const invalidVenue = {
        name: 'The Grand Theater',
        city: 'Los Angeles',
        state: 'D'.repeat(101),
      };

      const result = venueCreateSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
      expectFailureIssuePath(result, 'state');
    });

    it('should reject country exceeding 100 characters', () => {
      const invalidVenue = {
        name: 'The Grand Theater',
        city: 'Los Angeles',
        country: 'E'.repeat(101),
      };

      const result = venueCreateSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
      expectFailureIssuePath(result, 'country');
    });

    it('should reject notes exceeding 2000 characters', () => {
      const invalidVenue = {
        name: 'The Grand Theater',
        city: 'Los Angeles',
        notes: 'F'.repeat(2001),
      };

      const result = venueCreateSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
      expectFailureIssuePath(result, 'notes');
    });

    it('should reject negative capacity', () => {
      const invalidVenue = {
        name: 'The Grand Theater',
        city: 'Los Angeles',
        capacity: -100,
      };

      const result = venueCreateSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
      expectFailureIssuePath(result, 'capacity');
    });

    it('should reject zero capacity', () => {
      const invalidVenue = {
        name: 'The Grand Theater',
        city: 'Los Angeles',
        capacity: 0,
      };

      const result = venueCreateSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
      expectFailureIssuePath(result, 'capacity');
    });

    it('should accept null or undefined for optional fields', () => {
      const venue = {
        name: 'The Grand Theater',
        city: 'Los Angeles',
        address: null,
        state: null,
        country: null,
        postalCode: null,
        capacity: null,
        notes: null,
      };

      const result = venueCreateSchema.safeParse(venue);
      expect(result.success).toBe(true);
    });

    it('should accept a valid IANA timezone string', () => {
      const venue = {
        name: 'The Grand Theater',
        city: 'Los Angeles',
        timeZone: 'America/Los_Angeles',
      };

      const result = venueCreateSchema.safeParse(venue);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.timeZone).toBe('America/Los_Angeles');
    });

    it('should accept null timezone', () => {
      const venue = {
        name: 'The Grand Theater',
        city: 'Los Angeles',
        timeZone: null,
      };

      const result = venueCreateSchema.safeParse(venue);
      expect(result.success).toBe(true);
    });

    it('should reject an empty string timezone (min length 1)', () => {
      const venue = {
        name: 'The Grand Theater',
        city: 'Los Angeles',
        timeZone: '',
      };

      const result = venueCreateSchema.safeParse(venue);
      expect(result.success).toBe(false);
      expectFailureIssuePath(result, 'timeZone');
    });

    it('should reject timezone exceeding 100 characters', () => {
      const venue = {
        name: 'The Grand Theater',
        city: 'Los Angeles',
        timeZone: 'T'.repeat(101),
      };

      const result = venueCreateSchema.safeParse(venue);
      expect(result.success).toBe(false);
      expectFailureIssuePath(result, 'timeZone');
    });
  });

  describe('venueUpdateSchema', () => {
    it('should validate partial venue update', () => {
      const update = {
        name: 'Updated Theater Name',
        capacity: 6000,
      };

      const result = venueUpdateSchema.safeParse(update);
      expect(result.success).toBe(true);
    });

    it('should allow updating single field', () => {
      const update = {
        notes: 'Updated notes about the venue',
      };

      const result = venueUpdateSchema.safeParse(update);
      expect(result.success).toBe(true);
    });

    it('should reject update with invalid field values', () => {
      const update = {
        name: 'A'.repeat(201), // Exceeds max length
      };

      const result = venueUpdateSchema.safeParse(update);
      expect(result.success).toBe(false);
    });

    it('should allow empty update object', () => {
      const update = {};

      const result = venueUpdateSchema.safeParse(update);
      expect(result.success).toBe(true);
    });

    it('should allow updating timezone', () => {
      const update = { timeZone: 'Europe/London' };

      const result = venueUpdateSchema.safeParse(update);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.timeZone).toBe('Europe/London');
    });

    it('should allow clearing timezone with null', () => {
      const update = { timeZone: null };

      const result = venueUpdateSchema.safeParse(update);
      expect(result.success).toBe(true);
    });
  });

  describe('venueQuerySchema', () => {
    it('should validate empty query parameters', () => {
      const query = {};

      const result = venueQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it('should validate with search term', () => {
      const query = {
        search: 'Grand',
      };

      const result = venueQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it('should validate with city filter', () => {
      const query = {
        city: 'Los Angeles',
      };

      const result = venueQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it('should validate with pagination', () => {
      const query = {
        page: 1,
        limit: 50,
      };

      const result = venueQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it('should reject negative page number', () => {
      const query = {
        page: -1,
      };

      const result = venueQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });

    it('should reject limit exceeding maximum', () => {
      const query = {
        limit: 101,
      };

      const result = venueQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });
  });
});
