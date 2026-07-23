/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect } from 'react';

import { useWatch } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { useReleaseDateLookupQuery } from '../_hooks/use-release-date-lookup-query';

import type { UseFormReturn } from 'react-hook-form';

/** The facts the auto-lookup decision is made on. */
export interface ReleaseDateAutoFillDecision {
  /** The multipart upload state machine's status. */
  uploadStatus: string;
  title: string | undefined;
  releasedOn: string | undefined;
}

/**
 * Whether to auto-look-up a release date for the freshly uploaded video.
 *
 * Gated on all three: the upload has to have succeeded (the title/artist the
 * search runs on are only prefilled once a file is selected), there has to be a
 * title to search on, and the field has to still be empty — a date the admin
 * typed, or one a previous run already filled, is never re-searched.
 */
export const shouldLookupReleaseDate = ({
  uploadStatus,
  title,
  releasedOn,
}: ReleaseDateAutoFillDecision): boolean =>
  uploadStatus === 'success' && Boolean(title?.trim()) && !releasedOn?.trim();

interface UseReleaseDateAutoFillArgs {
  uploadStatus: string;
  form: UseFormReturn<VideoFormData>;
}

/**
 * Populate the release date from the web lookup as soon as a freshly uploaded
 * video has a title to search on, so the admin does not have to press "Find
 * release date" by hand. Best-effort and silent: a miss leaves the field empty
 * for the admin to fill (or to retry with the button), and the existing value
 * is never overwritten — the emptiness check is re-applied at apply time, not
 * just when the query is enabled.
 */
export const useReleaseDateAutoFill = ({
  uploadStatus,
  form,
}: UseReleaseDateAutoFillArgs): void => {
  const { control, getValues, setValue } = form;
  const title = useWatch({ control, name: 'title', defaultValue: '' });
  const artist = useWatch({ control, name: 'artist', defaultValue: '' });
  const releasedOn = useWatch({ control, name: 'releasedOn', defaultValue: '' });

  const { data } = useReleaseDateLookupQuery(title ?? '', artist ?? '', {
    enabled: shouldLookupReleaseDate({ uploadStatus, title, releasedOn }),
  });

  useEffect(() => {
    // Re-read the live value rather than trusting the watched one: `useWatch`
    // lags its store subscription on the first render, so an already-populated
    // date can still read as empty here and would be overwritten.
    if (!data?.releasedOn || getValues('releasedOn')?.trim()) return;
    setValue('releasedOn', data.releasedOn, { shouldDirty: true, shouldValidate: true });
  }, [data, getValues, setValue]);
};
