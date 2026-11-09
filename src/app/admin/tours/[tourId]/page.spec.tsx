/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';

import TourEditPage from './page';

vi.mock('server-only', () => ({}));

const mockFindAdminById = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/tours/tour-service', () => ({
  TourService: { findAdminById: (...args: unknown[]) => mockFindAdminById(...args) },
}));

vi.mock('@/app/admin/tours/components/tour-form', () => ({
  TourForm: ({
    tourId,
    initialTour,
  }: {
    tourId: string;
    initialTour: { title: string } | null;
  }) => (
    <div data-testid="tour-form" data-tour-id={tourId}>
      {initialTour?.title ?? 'no tour'}
    </div>
  ),
}));

const params = Promise.resolve({ tourId: '507f1f77bcf86cd799439011' });

describe('TourEditPage', () => {
  it('reads the unfiltered tour through TourService.findAdminById for the form', async () => {
    mockFindAdminById.mockResolvedValueOnce({ title: 'Spring Tour' });

    render(await TourEditPage({ params }));

    expect({
      reads: mockFindAdminById.mock.calls,
      form: screen.getByTestId('tour-form').textContent,
    }).toEqual({ reads: [['507f1f77bcf86cd799439011']], form: 'Spring Tour' });
  });

  it('hands the form no tour when none is found', async () => {
    mockFindAdminById.mockResolvedValueOnce(null);

    render(await TourEditPage({ params }));

    expect(screen.getByTestId('tour-form').textContent).toBe('no tour');
  });
});
