/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ReleaseService } from '@/lib/services/release-service';
import { EMPTY_FORM_STATE } from '@/lib/types/form-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';

import { updateReleaseAction } from './update-release-action';

// `update-release-action.spec.ts` mocks `getActionState`, so it never runs the
// real schema against real FormData. This spec does: the payload is built the
// way `useUpdateReleaseMutation` builds it (`objectToFormData`), and only the
// service, Prisma, and framework boundaries are mocked (#790).

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/prisma', () => ({
  prisma: {
    artistRelease: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock('@/lib/services/release-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

const RELEASE_ID = '507f1f77bcf86cd799439011';
const ARTIST_ID = '507f1f77bcf86cd799439022';

/** Release form values as `release-form.tsx` hands them to the mutation. */
const buildValues = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
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
    vi.mocked(requireRole).mockResolvedValue({ user: { id: 'admin-1' } } as never);
    vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
      success: true,
      data: { id: RELEASE_ID },
    } as never);
  });

  it('saves a release whose preloaded suggested price is "7.99"', async () => {
    const result = await updateReleaseAction(
      RELEASE_ID,
      EMPTY_FORM_STATE,
      objectToFormData(buildValues({ suggestedPrice: '7.99' }))
    );

    expect(result.success).toBe(true);
    expect(vi.mocked(ReleaseService.updateRelease).mock.calls[0][1]).toMatchObject({
      suggestedPrice: 799,
    });
  });

  it('saves a numeric title and a zero-padded catalog number verbatim', async () => {
    const result = await updateReleaseAction(
      RELEASE_ID,
      EMPTY_FORM_STATE,
      objectToFormData(buildValues({ title: '1999', catalogNumber: '001' }))
    );

    expect(result.success).toBe(true);
    expect(vi.mocked(ReleaseService.updateRelease).mock.calls[0][1]).toMatchObject({
      title: '1999',
      catalogNumber: '001',
    });
  });

  it('echoes the raw submitted strings back in formState.fields', async () => {
    const result = await updateReleaseAction(
      RELEASE_ID,
      EMPTY_FORM_STATE,
      objectToFormData(buildValues({ title: '1999', suggestedPrice: '7.99' }))
    );

    expect(result.fields).toMatchObject({ title: '1999', suggestedPrice: '7.99' });
  });
});
