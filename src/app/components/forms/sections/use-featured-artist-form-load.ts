/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect } from 'react';

import { toast } from 'sonner';

import { useFeaturedArtistQuery } from '@/app/hooks/use-featured-artist-query';
import { error } from '@/lib/utils/console-logger';
import type { FeaturedArtistFormData } from '@/lib/validation/create-featured-artist-schema';

import type { UseFormReturn } from 'react-hook-form';

interface ArtistDerivedState {
  setDerivedArtistIds: (ids: string[]) => void;
  setDerivedArtistNames: (names: string[]) => void;
  setFormatStatus: (status: 'idle' | 'loading' | 'found' | 'missing') => void;
}

const formatDate = (dateValue: Date | null): string => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

const toArtistName = (a: {
  displayName: string | null;
  firstName: string | null;
  surname: string | null;
}): string | null => {
  if (a.displayName) return a.displayName;
  const full = `${a.firstName ?? ''} ${a.surname ?? ''}`.trim();
  return full || null;
};

type FeaturedArtistRecord = NonNullable<ReturnType<typeof useFeaturedArtistQuery>['data']>;

/**
 * Projects a loaded featured-artist record into the form's default values.
 * Pure mapping (no side effects) so the load effect stays under the complexity
 * ceiling while preserving the exact null/empty fallbacks the form expects.
 */
const toFormValues = (fa: FeaturedArtistRecord): FeaturedArtistFormData => ({
  displayName: fa.displayName || '',
  description: fa.description || '',
  coverArt: fa.coverArt || '',
  position: fa.position ?? 0,
  featuredOn: formatDate(fa.featuredOn),
  featuredUntil: formatDate(fa.featuredUntil),
  digitalFormatId: fa.digitalFormatId || '',
  releaseId: fa.releaseId || '',
  featuredTrackNumber: fa.featuredTrackNumber ?? undefined,
});

/**
 * Loads a featured artist record in edit mode and projects it into form state.
 * Handles loading/error states via toast notifications.
 *
 * @returns isPending — true while the gated query is in-flight in edit mode.
 */
export const useFeaturedArtistFormLoad = (
  initialFeaturedArtistId: string | undefined,
  form: UseFormReturn<FeaturedArtistFormData>,
  derived: ArtistDerivedState
): boolean => {
  const { setDerivedArtistIds, setDerivedArtistNames, setFormatStatus } = derived;

  const {
    data: featuredArtistData,
    isPending: isFeaturedArtistPending,
    isError: isFeaturedArtistError,
    error: featuredArtistError,
  } = useFeaturedArtistQuery(initialFeaturedArtistId ?? '', {
    enabled: !!initialFeaturedArtistId,
  });

  const isLoadingFeaturedArtist = !!initialFeaturedArtistId && isFeaturedArtistPending;

  useEffect(() => {
    if (!initialFeaturedArtistId || !featuredArtistData) return;

    const fa = featuredArtistData;

    form.reset(toFormValues(fa));

    if (fa.digitalFormatId) {
      setFormatStatus('found');
    }

    setDerivedArtistIds(fa.artists.map((a) => a.id));
    setDerivedArtistNames(fa.artists.map(toArtistName).filter((n): n is string => !!n));
  }, [
    initialFeaturedArtistId,
    featuredArtistData,
    form,
    setDerivedArtistIds,
    setDerivedArtistNames,
    setFormatStatus,
  ]);

  useEffect(() => {
    if (initialFeaturedArtistId && isFeaturedArtistError) {
      error('Failed to fetch featured artist:', featuredArtistError);
      toast.error('Failed to load featured artist data');
    }
  }, [initialFeaturedArtistId, isFeaturedArtistError, featuredArtistError]);

  return isLoadingFeaturedArtist;
};
