/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type {
  ArtistFields,
  TourDateWithHeadliners,
} from '@/app/admin/tours/components/use-tour-date-form';
import { ArtistMultiSelect } from '@/app/components/forms/fields/artist-multi-select';

import type { Control } from 'react-hook-form';

export interface TourDateArtistsSectionProps {
  control: Control;
  tourDate?: TourDateWithHeadliners;
}

export const TourDateArtistsSection = ({ control, tourDate }: TourDateArtistsSectionProps) => {
  const initialArtists =
    tourDate?.headliners
      ?.filter(
        (h): h is typeof h & { artist: ArtistFields; artistId: string } =>
          h.artist != null && h.artistId != null
      )
      .map((h) => ({
        id: h.artistId,
        displayName: h.artist.displayName ?? '',
        firstName: h.artist.firstName,
        surname: h.artist.surname,
      })) ?? [];

  return (
    <section className="space-y-4">
      <h4 className="text-sm font-semibold">Headliners</h4>
      <ArtistMultiSelect
        control={control}
        name="headlinerIds"
        label="Headlining Artists"
        placeholder="Select artists"
        initialArtists={initialArtists}
      />
    </section>
  );
};
