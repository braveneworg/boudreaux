/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TourDateRepository } from '@/lib/repositories/tours/tour-date-repository';
import { DataError } from '@/lib/types/domain/errors';
import { logSecurityEvent } from '@/utils/audit-log';

import { TourDateService } from './tour-date-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/tours/tour-date-repository');
vi.mock('@/utils/audit-log');

const USER_ID = 'user-123';
const HEADLINER_ID = '507f1f77bcf86cd799439011';
const TOUR_DATE_ID = '507f1f77bcf86cd799439012';
const ARTIST_ID = '507f1f77bcf86cd799439013';
const SET_TIME = '2026-03-08T20:00:00.000Z';

const notFound = (): DataError => new DataError('NOT_FOUND', 'Not found');

describe('TourDateService', () => {
  describe('findByTourId', () => {
    it("returns the tour's dates", async () => {
      vi.mocked(TourDateRepository.findByTourId).mockResolvedValueOnce([{ id: 'd' }] as never);

      const result = await TourDateService.findByTourId('t');

      expect(result).toEqual({ success: true, data: [{ id: 'd' }] });
    });

    it('fails with the data error code when the read throws', async () => {
      vi.mocked(TourDateRepository.findByTourId).mockRejectedValueOnce(
        new DataError('UNAVAILABLE', 'down')
      );

      const result = await TourDateService.findByTourId('t');

      expect(result).toEqual({
        success: false,
        error: 'Database unavailable',
        code: 'UNAVAILABLE',
      });
    });
  });

  describe('create', () => {
    const input = {
      tourId: '507f1f77bcf86cd799439011',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      showStartTime: new Date('2026-06-01T20:00:00.000Z'),
      venueId: '507f1f77bcf86cd799439012',
      headlinerIds: ['507f1f77bcf86cd799439013'],
      timeZone: 'America/Chicago',
      utcOffset: -300,
    };

    it('creates the tour date with every parsed field and returns its id', async () => {
      vi.mocked(TourDateRepository.create).mockResolvedValueOnce({ id: 'new-date' } as never);

      const result = await TourDateService.create(input as never, USER_ID);

      expect(vi.mocked(TourDateRepository.create).mock.calls).toEqual([[input]]);
      expect(result).toEqual({ success: true, data: { id: 'new-date' } });
    });

    it('audit-logs the creation', async () => {
      vi.mocked(TourDateRepository.create).mockResolvedValueOnce({ id: 'new-date' } as never);

      await TourDateService.create(input as never, USER_ID);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'tourDate.created',
        userId: USER_ID,
        metadata: {
          tourDateId: 'new-date',
          tourId: input.tourId,
          venueId: input.venueId,
          headlinerCount: 1,
        },
      });
    });

    it('fails without logging when the write throws', async () => {
      vi.mocked(TourDateRepository.create).mockRejectedValueOnce(new Error('Database error'));

      const result = await TourDateService.create(input as never, USER_ID);

      expect(result).toEqual({
        success: false,
        error: 'Failed to create tour date',
        code: 'UNKNOWN',
      });
      expect(logSecurityEvent).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const input = {
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      venueId: '507f1f77bcf86cd799439012',
      timeZone: 'Europe/London',
      utcOffset: 60,
    };

    it('updates the tour date with every parsed field', async () => {
      vi.mocked(TourDateRepository.update).mockResolvedValueOnce({} as never);

      const result = await TourDateService.update(TOUR_DATE_ID, input as never, USER_ID);

      expect(vi.mocked(TourDateRepository.update).mock.calls).toEqual([[TOUR_DATE_ID, input]]);
      expect(result).toEqual({ success: true, data: undefined });
    });

    it('audit-logs the fields it updated', async () => {
      vi.mocked(TourDateRepository.update).mockResolvedValueOnce({} as never);

      await TourDateService.update(TOUR_DATE_ID, input as never, USER_ID);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'tourDate.updated',
        userId: USER_ID,
        metadata: {
          tourDateId: TOUR_DATE_ID,
          updatedFields: ['startDate', 'venueId', 'timeZone', 'utcOffset'],
        },
      });
    });

    it('fails when the write throws', async () => {
      vi.mocked(TourDateRepository.update).mockRejectedValueOnce(new Error('Database error'));

      const result = await TourDateService.update(TOUR_DATE_ID, input as never, USER_ID);

      expect(result).toEqual({
        success: false,
        error: 'Failed to update tour date',
        code: 'UNKNOWN',
      });
    });
  });

  describe('delete', () => {
    it('deletes and audit-logs the tour date', async () => {
      vi.mocked(TourDateRepository.delete).mockResolvedValueOnce({} as never);

      const result = await TourDateService.delete(TOUR_DATE_ID, USER_ID);

      expect(TourDateRepository.delete).toHaveBeenCalledWith(TOUR_DATE_ID);
      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'tourDate.deleted',
        userId: USER_ID,
        metadata: { tourDateId: TOUR_DATE_ID },
      });
      expect(result).toEqual({ success: true, data: undefined });
    });

    it('fails with fixed copy when the delete throws', async () => {
      vi.mocked(TourDateRepository.delete).mockRejectedValueOnce(new Error('DB error'));

      const result = await TourDateService.delete(TOUR_DATE_ID, USER_ID);

      expect(result).toEqual({
        success: false,
        error: 'Failed to delete tour date',
        code: 'UNKNOWN',
      });
    });
  });

  describe('updateHeadlinerSetTime', () => {
    it('sets the time by headliner id and audit-logs it', async () => {
      const result = await TourDateService.updateHeadlinerSetTime(
        { headlinerId: HEADLINER_ID, setTime: SET_TIME },
        USER_ID
      );

      expect(TourDateRepository.updateHeadlinerSetTime).toHaveBeenCalledWith(
        HEADLINER_ID,
        new Date(SET_TIME)
      );
      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'tourDateHeadliner.setTimeUpdated',
        userId: USER_ID,
        metadata: { headlinerId: HEADLINER_ID, setTime: SET_TIME },
      });
      expect(result).toEqual({ success: true, data: undefined });
    });

    it('clears the time with null', async () => {
      await TourDateService.updateHeadlinerSetTime(
        { headlinerId: HEADLINER_ID, setTime: null },
        USER_ID
      );

      expect(TourDateRepository.updateHeadlinerSetTime).toHaveBeenCalledWith(HEADLINER_ID, null);
    });

    it('fails without a retry when the update throws anything but NOT_FOUND', async () => {
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockRejectedValueOnce(
        new Error('Database error')
      );

      const result = await TourDateService.updateHeadlinerSetTime(
        {
          headlinerId: HEADLINER_ID,
          setTime: SET_TIME,
          tourDateId: TOUR_DATE_ID,
          artistId: ARTIST_ID,
        },
        USER_ID
      );

      expect(TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Failed to update set time',
        code: 'UNKNOWN',
      });
    });

    it('retries by tour date and artist after a NOT_FOUND, logging the fallback', async () => {
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockRejectedValueOnce(notFound());
      vi.mocked(TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist).mockResolvedValueOnce(
        true as never
      );

      const result = await TourDateService.updateHeadlinerSetTime(
        {
          headlinerId: HEADLINER_ID,
          setTime: SET_TIME,
          tourDateId: TOUR_DATE_ID,
          artistId: ARTIST_ID,
        },
        USER_ID
      );

      expect(TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist).toHaveBeenCalledWith(
        TOUR_DATE_ID,
        ARTIST_ID,
        new Date(SET_TIME)
      );
      expect(vi.mocked(logSecurityEvent).mock.calls).toEqual([
        [
          {
            event: 'tourDateHeadliner.setTimeUpdated',
            userId: USER_ID,
            metadata: {
              headlinerId: HEADLINER_ID,
              artistId: ARTIST_ID,
              setTime: SET_TIME,
              fallback: true,
            },
          },
        ],
      ]);
      expect(result).toEqual({ success: true, data: undefined });
    });

    it('fails when the retry finds no headliner', async () => {
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockRejectedValueOnce(notFound());
      vi.mocked(TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist).mockResolvedValueOnce(
        false as never
      );

      const result = await TourDateService.updateHeadlinerSetTime(
        {
          headlinerId: HEADLINER_ID,
          setTime: SET_TIME,
          tourDateId: TOUR_DATE_ID,
          artistId: ARTIST_ID,
        },
        USER_ID
      );

      expect(result).toEqual({
        success: false,
        error: 'Failed to update set time',
        code: 'UNKNOWN',
      });
      expect(logSecurityEvent).not.toHaveBeenCalled();
    });

    it('fails when the retry itself throws', async () => {
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockRejectedValueOnce(notFound());
      vi.mocked(TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist).mockRejectedValueOnce(
        new Error('fallback exploded')
      );

      const result = await TourDateService.updateHeadlinerSetTime(
        {
          headlinerId: HEADLINER_ID,
          setTime: SET_TIME,
          tourDateId: TOUR_DATE_ID,
          artistId: ARTIST_ID,
        },
        USER_ID
      );

      expect(result).toEqual({
        success: false,
        error: 'Failed to update set time',
        code: 'UNKNOWN',
      });
    });

    it.each([
      ['an invalid tour date id', { tourDateId: 'invalid-id', artistId: ARTIST_ID }],
      ['an invalid artist id', { tourDateId: TOUR_DATE_ID, artistId: 'invalid-id' }],
      ['no tour date id', { artistId: ARTIST_ID }],
      ['no artist id', { tourDateId: TOUR_DATE_ID }],
    ])('does not retry a NOT_FOUND given %s', async (_label, ids) => {
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockRejectedValueOnce(notFound());

      const result = await TourDateService.updateHeadlinerSetTime(
        { headlinerId: HEADLINER_ID, setTime: SET_TIME, ...ids },
        USER_ID
      );

      expect(TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Failed to update set time',
        code: 'UNKNOWN',
      });
    });
  });

  describe('removeHeadliner', () => {
    it('removes the headliner by id and audit-logs it', async () => {
      const result = await TourDateService.removeHeadliner({ headlinerId: HEADLINER_ID }, USER_ID);

      expect(TourDateRepository.removeHeadliner).toHaveBeenCalledWith(HEADLINER_ID);
      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'tourDateHeadliner.removed',
        userId: USER_ID,
        metadata: { headlinerId: HEADLINER_ID },
      });
      expect(result).toEqual({ success: true, data: undefined });
    });

    it('fails without a retry when the removal throws anything but NOT_FOUND', async () => {
      vi.mocked(TourDateRepository.removeHeadliner).mockRejectedValueOnce(
        new Error('Database error')
      );

      const result = await TourDateService.removeHeadliner(
        { headlinerId: HEADLINER_ID, tourDateId: TOUR_DATE_ID, artistId: ARTIST_ID },
        USER_ID
      );

      expect(TourDateRepository.removeHeadlinerByTourDateAndArtist).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Failed to remove headliner',
        code: 'UNKNOWN',
      });
    });

    it('retries by tour date and artist after a NOT_FOUND, logging the fallback', async () => {
      vi.mocked(TourDateRepository.removeHeadliner).mockRejectedValueOnce(notFound());
      vi.mocked(TourDateRepository.removeHeadlinerByTourDateAndArtist).mockResolvedValueOnce(true);

      const result = await TourDateService.removeHeadliner(
        { headlinerId: HEADLINER_ID, tourDateId: TOUR_DATE_ID, artistId: ARTIST_ID },
        USER_ID
      );

      expect(TourDateRepository.removeHeadlinerByTourDateAndArtist).toHaveBeenCalledWith(
        TOUR_DATE_ID,
        ARTIST_ID
      );
      expect(vi.mocked(logSecurityEvent).mock.calls).toEqual([
        [
          {
            event: 'tourDateHeadliner.removed',
            userId: USER_ID,
            metadata: { headlinerId: HEADLINER_ID, artistId: ARTIST_ID, fallback: true },
          },
        ],
      ]);
      expect(result).toEqual({ success: true, data: undefined });
    });

    it('fails when the retry finds no headliner', async () => {
      vi.mocked(TourDateRepository.removeHeadliner).mockRejectedValueOnce(notFound());
      vi.mocked(TourDateRepository.removeHeadlinerByTourDateAndArtist).mockResolvedValueOnce(false);

      const result = await TourDateService.removeHeadliner(
        { headlinerId: HEADLINER_ID, tourDateId: TOUR_DATE_ID, artistId: ARTIST_ID },
        USER_ID
      );

      expect(result).toEqual({
        success: false,
        error: 'Failed to remove headliner',
        code: 'UNKNOWN',
      });
    });

    it('fails when the retry itself throws', async () => {
      vi.mocked(TourDateRepository.removeHeadliner).mockRejectedValueOnce(notFound());
      vi.mocked(TourDateRepository.removeHeadlinerByTourDateAndArtist).mockRejectedValueOnce(
        new Error('fallback exploded')
      );

      const result = await TourDateService.removeHeadliner(
        { headlinerId: HEADLINER_ID, tourDateId: TOUR_DATE_ID, artistId: ARTIST_ID },
        USER_ID
      );

      expect(result).toEqual({
        success: false,
        error: 'Failed to remove headliner',
        code: 'UNKNOWN',
      });
    });

    it('does not retry a NOT_FOUND given an invalid tour date id', async () => {
      vi.mocked(TourDateRepository.removeHeadliner).mockRejectedValueOnce(notFound());

      const result = await TourDateService.removeHeadliner(
        { headlinerId: HEADLINER_ID, tourDateId: 'invalid-id', artistId: ARTIST_ID },
        USER_ID
      );

      expect(TourDateRepository.removeHeadlinerByTourDateAndArtist).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Failed to remove headliner',
        code: 'UNKNOWN',
      });
    });
  });

  describe('reorderHeadliners', () => {
    const headlinerIds = [HEADLINER_ID, ARTIST_ID];

    it('stores the order and audit-logs it', async () => {
      const result = await TourDateService.reorderHeadliners(TOUR_DATE_ID, headlinerIds, USER_ID);

      expect(TourDateRepository.reorderHeadliners).toHaveBeenCalledWith(TOUR_DATE_ID, headlinerIds);
      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'tourDateHeadliner.reordered',
        userId: USER_ID,
        metadata: { tourDateId: TOUR_DATE_ID, headlinerIds },
      });
      expect(result).toEqual({ success: true, data: undefined });
    });

    it('fails when the write throws', async () => {
      vi.mocked(TourDateRepository.reorderHeadliners).mockRejectedValueOnce(
        new Error('Database error')
      );

      const result = await TourDateService.reorderHeadliners(TOUR_DATE_ID, headlinerIds, USER_ID);

      expect(result).toEqual({
        success: false,
        error: 'Failed to reorder headliners',
        code: 'UNKNOWN',
      });
    });
  });
});
