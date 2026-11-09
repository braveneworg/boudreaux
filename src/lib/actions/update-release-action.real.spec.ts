/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { gateAction } from '@/lib/auth/action-gate';
import { ReleaseService } from '@/lib/services/release-service';
import type { ReleaseActionInput } from '@/lib/validation/create-release-schema';

import { updateReleaseAction } from './update-release-action';

// `update-release-action.spec.ts` mocks `readActionInput`, so it never runs the
// real input reader and schema. This spec does, on the values
// `useUpdateReleaseMutation` passes, and only the service, Prisma, and
// framework boundaries are mocked (#790).

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/release-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');

const RELEASE_ID = '507f1f77bcf86cd799439011';
const ARTIST_ID = '507f1f77bcf86cd799439022';

/** Release form values as `release-form.tsx` hands them to the mutation. */
const buildValues = (overrides: Partial<ReleaseActionInput> = {}): ReleaseActionInput => ({
  title: 'Real Title',
  releasedOn: '2024-01-15',
  coverArt: 'https://example.com/cover.jpg',
  formats: ['DIGITAL'],
  artistIds: [ARTIST_ID],
  catalogNumber: 'BNW-001',
  ...overrides,
});

describe('updateReleaseAction with the real schema', () => {
  beforeEach(() => {
    vi.mocked(gateAction).mockResolvedValue({
      success: true,
      session: { user: { id: 'admin-1' } } as never,
    });
    vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
      success: true,
      data: { id: RELEASE_ID },
    } as never);
  });

  it('saves a release whose preloaded suggested price is "7.99"', async () => {
    const result = await updateReleaseAction(RELEASE_ID, buildValues({ suggestedPrice: '7.99' }));

    expect(result.success).toBe(true);
    expect(vi.mocked(ReleaseService.updateRelease).mock.calls[0][1]).toMatchObject({
      suggestedPrice: 799,
    });
  });

  it('saves a numeric title and a zero-padded catalog number verbatim', async () => {
    const result = await updateReleaseAction(
      RELEASE_ID,
      buildValues({ title: '1999', catalogNumber: '001' })
    );

    expect(result.success).toBe(true);
    expect(vi.mocked(ReleaseService.updateRelease).mock.calls[0][1]).toMatchObject({
      title: '1999',
      catalogNumber: '001',
    });
  });

  // The edit form sends a blank for a field the admin emptied (#759).
  it('clears an emptied catalog number to null', async () => {
    const result = await updateReleaseAction(RELEASE_ID, buildValues({ catalogNumber: '' }));

    expect(result.success).toBe(true);
    expect(vi.mocked(ReleaseService.updateRelease).mock.calls[0][1]).toMatchObject({
      catalogNumber: null,
    });
  });
});
