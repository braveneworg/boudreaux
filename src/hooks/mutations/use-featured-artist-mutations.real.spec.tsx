/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { gateAction } from '@/lib/auth/action-gate';
import { FeaturedArtistRepository } from '@/lib/repositories/featured-artist-repository';
import type { FeaturedArtistFormData } from '@/lib/validation/create-featured-artist-schema';

import { useUpdateFeaturedArtistMutation } from './use-featured-artist-mutations';

// The edit page's save, end to end below the form: the real mutation hook,
// action and service run, and only the repository, the auth gate and the
// framework are mocked (the repository's update spreads its input straight
// into `prisma.featuredArtist.update`, so what it receives is what Prisma
// writes). `use-featured-artist-mutations.spec.tsx` mocks the
// action and `update-featured-artist-action.spec.ts` mocks the service, so
// neither can see what a cleared field turns into by the time it is written.

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');
vi.mock('@/lib/repositories/featured-artist-repository');

const FEATURED_ARTIST_ID = '507f1f77bcf86cd799439011';
const RELEASE_ID = '507f1f77bcf86cd799439022';
const DIGITAL_FORMAT_ID = '507f1f77bcf86cd799439033';
const ARTIST_ID = '507f1f77bcf86cd799439044';

/** The form values of a loaded row that has every optional field set. */
const LOADED: FeaturedArtistFormData = {
  displayName: 'Spotlight name',
  description: 'Spotlight blurb',
  coverArt: 'https://cdn.example.com/cover.jpg',
  position: 2,
  featuredOn: '2026-01-01',
  featuredUntil: '2026-12-31',
  digitalFormatId: DIGITAL_FORMAT_ID,
  releaseId: RELEASE_ID,
  featuredTrackNumber: 3,
};

const renderUpdateMutation = () => {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useUpdateFeaturedArtistMutation(), { wrapper }).result;
};

/** Save the loaded row with `edits` applied, and return what the repository got. */
const saveWith = async (edits: Partial<FeaturedArtistFormData>): Promise<unknown> => {
  const result = renderUpdateMutation();
  const state = await result.current.updateFeaturedArtistAsync({
    featuredArtistId: FEATURED_ARTIST_ID,
    values: { ...LOADED, ...edits, artistIds: [ARTIST_ID] },
  });
  expect(state.success).toBe(true);
  return vi.mocked(FeaturedArtistRepository.update).mock.calls[0]?.[1];
};

describe('useUpdateFeaturedArtistMutation through the real action and service', () => {
  beforeEach(() => {
    vi.mocked(gateAction).mockResolvedValue({
      success: true,
      session: { user: { id: 'admin-1' } } as never,
    });
    vi.mocked(FeaturedArtistRepository.update).mockResolvedValue({
      id: FEATURED_ARTIST_ID,
    } as never);
  });

  // Each of these is a text input or the cover-art "Remove" button on the
  // edit page; emptying it leaves the form value ''.
  it.each(['displayName', 'description', 'coverArt'] as const)(
    'clears %s when the admin empties it',
    async (field) => {
      const data = await saveWith({ [field]: '' });

      expect(data).toMatchObject({ [field]: null });
    }
  );

  // The "Featured Until" date picker's Clear button sets ''.
  it('clears featuredUntil when the admin presses Clear', async () => {
    const data = await saveWith({ featuredUntil: '' });

    expect(data).toMatchObject({ featuredUntil: null });
  });

  // Picking another release resets the featured track to `undefined`
  // (`use-digital-format-sync.ts`); the new release starts at track 1.
  it('clears featuredTrackNumber when the release change reset it', async () => {
    const data = await saveWith({ featuredTrackNumber: undefined });

    expect(data).toMatchObject({ featuredTrackNumber: null });
  });

  it('keeps every field the admin did not change', async () => {
    const data = await saveWith({});

    expect(data).toMatchObject({
      displayName: 'Spotlight name',
      description: 'Spotlight blurb',
      coverArt: 'https://cdn.example.com/cover.jpg',
      position: 2,
      featuredOn: new Date('2026-01-01'),
      featuredUntil: new Date('2026-12-31'),
      featuredTrackNumber: 3,
      artists: { set: [{ id: ARTIST_ID }] },
      digitalFormat: { connect: { id: DIGITAL_FORMAT_ID } },
      release: { connect: { id: RELEASE_ID } },
    });
  });
});
