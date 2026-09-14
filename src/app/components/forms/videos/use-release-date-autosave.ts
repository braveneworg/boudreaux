/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState } from 'react';

import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { useUpdateVideoReleaseDateMutation } from '@/hooks/mutations/use-video-mutations';
import { useDebounce } from '@/hooks/use-debounce';
import { toIsoDay } from '@/lib/utils/validation/iso-date';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import type { UseFormReturn } from 'react-hook-form';

/** Quiet period after the last change before the date is written. */
export const RELEASE_DATE_AUTOSAVE_DEBOUNCE_MS = 600;

const AUTOSAVE_FAILED_MESSAGE = 'Could not save the release date — try again.';

export interface UseReleaseDateAutosaveArgs {
  form: UseFormReturn<VideoFormData>;
  /** The persisted row's id (edit id, else draft id); no write without one. */
  videoId: string | undefined;
  /** The loaded row's day (`YYYY-MM-DD` or `''`), so edit-open never writes. */
  persistedReleasedOn: string;
  debounceMs?: number;
}

/**
 * Persists ONLY the release date whenever it changes on a form whose row
 * already exists — an admin pick or an automatic fill — through
 * `updateVideoReleaseDateAction`, debounced. After a successful write the
 * field is reset clean to the saved day (so Save is not forced and the
 * edit-mode `keepDirtyValues` reset agrees with the row); a value typed
 * during the round-trip stays dirty and is written next. Nothing is written
 * when there is no row yet, when the value is empty or not a calendar day
 * (Save/Publish still require one), or when it equals what the row already
 * holds. A failed write leaves the field dirty and toasts; Save still
 * carries it.
 */
export const useReleaseDateAutosave = ({
  form,
  videoId,
  persistedReleasedOn,
  debounceMs = RELEASE_DATE_AUTOSAVE_DEBOUNCE_MS,
}: UseReleaseDateAutosaveArgs): void => {
  const { control, getValues, resetField } = form;
  // No `defaultValue`: RHF would report it instead of the loaded row's value
  // until the field first changes (see use-release-date-auto-lookup.ts).
  const releasedOn = useWatch({ control, name: 'releasedOn' }) ?? '';
  const debounced = useDebounce(releasedOn, debounceMs);
  const { updateVideoReleaseDateAsync } = useUpdateVideoReleaseDateMutation();

  const lastPersistedRef = useRef(persistedReleasedOn);
  // A day whose write failed is not retried until the value changes — the
  // settle tick below would otherwise loop the same failing write and toast.
  const lastFailedRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  // Bumped when a write settles so a value changed mid-flight gets its turn.
  const [settledTick, setSettledTick] = useState(0);

  useEffect(() => {
    lastPersistedRef.current = persistedReleasedOn;
  }, [persistedReleasedOn]);

  useEffect(() => {
    if (!videoId || inFlightRef.current) return;
    const day = toIsoDay(debounced);
    if (!day || day === lastPersistedRef.current || day === lastFailedRef.current) return;

    const fail = (): void => {
      lastFailedRef.current = day;
      toast.error(AUTOSAVE_FAILED_MESSAGE);
    };
    inFlightRef.current = true;
    updateVideoReleaseDateAsync({ videoId, releasedOn: day })
      .then((result) => {
        if (!result.success) {
          fail();
          return;
        }
        lastPersistedRef.current = day;
        lastFailedRef.current = null;
        if (toIsoDay(getValues('releasedOn')) === day) {
          resetField('releasedOn', { defaultValue: day });
        }
      })
      .catch(fail)
      .finally(() => {
        inFlightRef.current = false;
        setSettledTick((tick) => tick + 1);
      });
  }, [videoId, debounced, settledTick, updateVideoReleaseDateAsync, getValues, resetField]);
};
