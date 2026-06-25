/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect } from 'react';

import { useReleaseDigitalFormatQuery } from '@/app/hooks/use-release-digital-format-query';
import type { FeaturedArtistFormData } from '@/lib/validation/create-featured-artist-schema';

import type { UseFormReturn } from 'react-hook-form';

export interface TrackOption {
  trackNumber: number;
  title: string | null;
  fileName: string;
}

interface DigitalFormatSyncState {
  setFormatStatus: (status: 'idle' | 'loading' | 'found' | 'missing') => void;
  setFormatFileCount: (count: number) => void;
  setFormatTracks: (tracks: TrackOption[]) => void;
}

/**
 * Syncs the MP3_320KBPS digital-format query for the watched release ID into
 * local form state. Sets digitalFormatId and featuredTrackNumber via setValue
 * and populates the track list for the featured-track selector.
 */
export const useDigitalFormatSync = (
  watchedReleaseId: string | undefined,
  isLoadingFeaturedArtist: boolean,
  form: UseFormReturn<FeaturedArtistFormData>,
  sync: DigitalFormatSyncState
): void => {
  const { setFormatStatus, setFormatFileCount, setFormatTracks } = sync;
  const { setValue } = form;

  const {
    data: digitalFormat,
    isPending: isDigitalFormatPending,
    isError: isDigitalFormatError,
  } = useReleaseDigitalFormatQuery(watchedReleaseId ?? '', 'MP3_320KBPS', {
    enabled: !!watchedReleaseId && !isLoadingFeaturedArtist,
  });

  useEffect(() => {
    if (isLoadingFeaturedArtist) return;

    if (!watchedReleaseId) {
      setFormatStatus('idle');
      setFormatFileCount(0);
      setFormatTracks([]);
      setValue('digitalFormatId', '');
      setValue('featuredTrackNumber', undefined);
      return;
    }

    if (isDigitalFormatPending) {
      setFormatStatus('loading');
      setFormatFileCount(0);
      setFormatTracks([]);
      setValue('digitalFormatId', '');
      setValue('featuredTrackNumber', undefined);
      return;
    }

    if (!digitalFormat) {
      setFormatStatus('missing');
      form.setError('digitalFormatId', {
        type: 'manual',
        message: isDigitalFormatError
          ? 'Failed to check digital format availability.'
          : 'Selected release has no MP3 320kbps format. Please upload format files first.',
      });
      return;
    }

    setValue('digitalFormatId', digitalFormat.id, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setFormatStatus('found');
    setFormatFileCount(digitalFormat.files.length);
    setFormatTracks(
      [...digitalFormat.files]
        .sort((a, b) => a.trackNumber - b.trackNumber)
        .map((f) => ({
          trackNumber: f.trackNumber,
          title: f.title,
          fileName: f.fileName,
        }))
    );
    form.clearErrors('digitalFormatId');
  }, [
    isLoadingFeaturedArtist,
    watchedReleaseId,
    isDigitalFormatPending,
    isDigitalFormatError,
    digitalFormat,
    setValue,
    form,
    setFormatStatus,
    setFormatFileCount,
    setFormatTracks,
  ]);
};
