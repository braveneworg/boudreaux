/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { tourDateCreateSchema, tourDateUpdateSchema } from './tour-date-schema';

describe('tourDateCreateSchema', () => {
  const validBase = {
    tourId: '507f1f77bcf86cd799439011',
    startDate: '2026-06-01T00:00:00.000Z',
    showStartTime: '2026-06-01T20:00:00.000Z',
    venueId: '507f1f77bcf86cd799439012',
    headlinerIds: ['507f1f77bcf86cd799439013'],
  };

  it('accepts a valid tour date with required fields only', () => {
    const result = tourDateCreateSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('accepts a valid IANA timezone string', () => {
    const result = tourDateCreateSchema.safeParse({
      ...validBase,
      timeZone: 'America/Chicago',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.timeZone).toBe('America/Chicago');
  });

  it('accepts null for timeZone', () => {
    const result = tourDateCreateSchema.safeParse({ ...validBase, timeZone: null });
    expect(result.success).toBe(true);
  });

  it('accepts undefined timeZone (omitted)', () => {
    const result = tourDateCreateSchema.safeParse({ ...validBase });
    expect(result.success).toBe(true);
  });

  it('rejects an empty string timeZone', () => {
    const result = tourDateCreateSchema.safeParse({ ...validBase, timeZone: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a timeZone longer than 100 characters', () => {
    const result = tourDateCreateSchema.safeParse({
      ...validBase,
      timeZone: 'A'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a timeZone of exactly 100 characters', () => {
    const result = tourDateCreateSchema.safeParse({
      ...validBase,
      timeZone: 'A'.repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid utcOffset (UTC-5 = -300)', () => {
    const result = tourDateCreateSchema.safeParse({ ...validBase, utcOffset: -300 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.utcOffset).toBe(-300);
  });

  it('coerces a numeric string utcOffset', () => {
    const result = tourDateCreateSchema.safeParse({ ...validBase, utcOffset: '-300' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.utcOffset).toBe(-300);
  });

  it('accepts the minimum boundary utcOffset (-840)', () => {
    const result = tourDateCreateSchema.safeParse({ ...validBase, utcOffset: -840 });
    expect(result.success).toBe(true);
  });

  it('accepts the maximum boundary utcOffset (840)', () => {
    const result = tourDateCreateSchema.safeParse({ ...validBase, utcOffset: 840 });
    expect(result.success).toBe(true);
  });

  it('rejects utcOffset below -840', () => {
    const result = tourDateCreateSchema.safeParse({ ...validBase, utcOffset: -841 });
    expect(result.success).toBe(false);
  });

  it('rejects utcOffset above 840', () => {
    const result = tourDateCreateSchema.safeParse({ ...validBase, utcOffset: 841 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer utcOffset', () => {
    const result = tourDateCreateSchema.safeParse({ ...validBase, utcOffset: -300.5 });
    expect(result.success).toBe(false);
  });

  it('accepts null for utcOffset', () => {
    const result = tourDateCreateSchema.safeParse({ ...validBase, utcOffset: null });
    expect(result.success).toBe(true);
  });

  it('accepts both timeZone and utcOffset together', () => {
    const result = tourDateCreateSchema.safeParse({
      ...validBase,
      timeZone: 'America/Chicago',
      utcOffset: -300,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when tourId is missing', () => {
    const { tourId: _, ...rest } = validBase;
    const result = tourDateCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects when startDate is missing', () => {
    const { startDate: _, ...rest } = validBase;
    const result = tourDateCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects when showStartTime is missing', () => {
    const { showStartTime: _, ...rest } = validBase;
    const result = tourDateCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects when venueId is missing', () => {
    const { venueId: _, ...rest } = validBase;
    const result = tourDateCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects when headlinerIds is empty', () => {
    const result = tourDateCreateSchema.safeParse({ ...validBase, headlinerIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects when endDate is before startDate', () => {
    const result = tourDateCreateSchema.safeParse({
      ...validBase,
      endDate: '2026-05-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const endDateError = result.error.issues.find((i) => i.path.includes('endDate'));
    expect(endDateError?.message).toBe('End date must be after start date');
  });

  it('accepts endDate on the same day as startDate', () => {
    const result = tourDateCreateSchema.safeParse({
      ...validBase,
      endDate: '2026-06-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional text fields', () => {
    const result = tourDateCreateSchema.safeParse({
      ...validBase,
      notes: 'Special event',
      ticketPrices: '$25 - $100',
      ticketsUrl: 'https://example.com/tickets',
    });
    expect(result.success).toBe(true);
  });

  it('rejects ticketsUrl that is not a valid URL', () => {
    const result = tourDateCreateSchema.safeParse({
      ...validBase,
      ticketsUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty string for ticketsUrl', () => {
    const result = tourDateCreateSchema.safeParse({
      ...validBase,
      ticketsUrl: '',
    });
    expect(result.success).toBe(true);
  });
});

describe('tourDateUpdateSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    const result = tourDateUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts a valid IANA timezone string', () => {
    const result = tourDateUpdateSchema.safeParse({ timeZone: 'America/New_York' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.timeZone).toBe('America/New_York');
  });

  it('accepts null to clear timeZone', () => {
    const result = tourDateUpdateSchema.safeParse({ timeZone: null });
    expect(result.success).toBe(true);
  });

  it('rejects empty string timeZone', () => {
    const result = tourDateUpdateSchema.safeParse({ timeZone: '' });
    expect(result.success).toBe(false);
  });

  it('accepts a valid utcOffset', () => {
    const result = tourDateUpdateSchema.safeParse({ utcOffset: 330 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.utcOffset).toBe(330);
  });

  it('accepts null to clear utcOffset', () => {
    const result = tourDateUpdateSchema.safeParse({ utcOffset: null });
    expect(result.success).toBe(true);
  });

  it('rejects invalid utcOffset', () => {
    const result = tourDateUpdateSchema.safeParse({ utcOffset: 999 });
    expect(result.success).toBe(false);
  });

  it('fails refinement when endDate is before startDate', () => {
    const result = tourDateUpdateSchema.safeParse({
      startDate: '2026-06-05T00:00:00.000Z',
      endDate: '2026-06-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const endDateError = result.error.issues.find((i) => i.path.includes('endDate'));
    expect(endDateError?.message).toBe('End date must be after start date');
  });

  it('passes refinement when only startDate is provided', () => {
    const result = tourDateUpdateSchema.safeParse({
      startDate: '2026-06-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('passes refinement when only endDate is provided', () => {
    const result = tourDateUpdateSchema.safeParse({
      endDate: '2026-06-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
