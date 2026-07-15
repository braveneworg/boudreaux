/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo } from 'react';

import { useWatch } from 'react-hook-form';

import { composeArtistString, splitFeaturedArtists } from '@/lib/utils/artist-name-split';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import type { Control, UseFormSetValue } from 'react-hook-form';

interface UseVideoArtistFieldsArgs {
  control: Control<VideoFormData>;
  setValue: UseFormSetValue<VideoFormData>;
}

export interface VideoArtistFields {
  primary: string;
  featured: string[];
  setPrimary: (name: string) => void;
  setFeatured: (names: string[]) => void;
}

/**
 * Structured editor over the canonical `artist` string. Derives the primary
 * name and featured names from the current value; both setters recompose the
 * string and write it back so `artist` stays the single source of truth.
 *
 * No render loop risk: the hook reads `artist` via `useWatch` (reactive read),
 * and writes back only in response to user actions (`setPrimary`/`setFeatured`)
 * — never in a `useEffect`. `useMemo` derives the structured values; the
 * setters call `setValue` which triggers RHF state updates that flow back via
 * `useWatch`, but since the setters are only called by event handlers (never
 * during render) there is no cycle.
 */
export const useVideoArtistFields = ({
  control,
  setValue,
}: UseVideoArtistFieldsArgs): VideoArtistFields => {
  const artist = useWatch({ control, name: 'artist', defaultValue: '' });

  const { primary, featured } = useMemo(() => {
    const parts = splitFeaturedArtists(artist ?? '');
    const primaryPart = parts.find((p) => p.role === 'primary')?.name ?? '';
    const featuredParts = parts.filter((p) => p.role === 'featured').map((p) => p.name);
    return { primary: primaryPart, featured: featuredParts };
  }, [artist]);

  const write = useCallback(
    (nextPrimary: string, nextFeatured: string[]): void => {
      setValue('artist', composeArtistString(nextPrimary, nextFeatured), {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [setValue]
  );

  const setPrimary = useCallback((name: string): void => write(name, featured), [write, featured]);
  const setFeatured = useCallback(
    (names: string[]): void => write(primary, names),
    [write, primary]
  );

  return { primary, featured, setPrimary, setFeatured };
};
