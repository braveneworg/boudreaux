/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { CheckCircle2, XCircle } from 'lucide-react';

import { TextField } from '@/app/components/forms/fields';
import { ReleaseSelect, type ReleaseOption } from '@/app/components/forms/fields/release-select';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Separator } from '@/app/components/ui/separator';
import { Textarea } from '@/app/components/ui/textarea';
import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';
import type { FeaturedArtistFormData } from '@/lib/validation/create-featured-artist-schema';

import type { TrackOption } from './use-digital-format-sync';
import type { Control } from 'react-hook-form';

interface MediaAssociationsSectionProps {
  control: Control<FeaturedArtistFormData>;
  formatStatus: 'idle' | 'loading' | 'found' | 'missing';
  formatFileCount: number;
  formatTracks: TrackOption[];
  derivedArtistNames: string[];
  onReleaseChange: (release: ReleaseOption | null) => void;
}

export const MediaAssociationsSection = ({
  control,
  formatStatus,
  formatFileCount,
  formatTracks,
  derivedArtistNames,
  onReleaseChange,
}: MediaAssociationsSectionProps): React.ReactElement => (
  <div className="space-y-4">
    <h3 className="text-lg font-medium">Media Associations</h3>
    <p className="text-sm text-zinc-950">
      Associate this featured artist with a release. The MP3 320kbps digital format is automatically
      used for audio playback.
    </p>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <ReleaseSelect
          control={control}
          name="releaseId"
          label="Release"
          placeholder="Select a release..."
          validateOnChange
          onReleaseChange={onReleaseChange}
        />

        {formatStatus === 'loading' && (
          <p className="text-sm text-zinc-950">Checking for MP3 320kbps format...</p>
        )}
        {formatStatus === 'found' && (
          <p className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            MP3 320kbps format available ({formatFileCount}{' '}
            {formatFileCount === 1 ? 'file' : 'files'})
          </p>
        )}
        {formatStatus === 'missing' && (
          <p className="text-destructive flex items-center gap-1.5 text-sm">
            <XCircle className="h-4 w-4" />
            No MP3 320kbps format found. Please upload format files first.
          </p>
        )}

        {formatStatus === 'found' && formatTracks.length > 0 && (
          <FeaturedTrackField control={control} formatTracks={formatTracks} />
        )}
      </div>
    </div>

    {derivedArtistNames.length > 0 && (
      <p className="text-sm text-zinc-950">Associated artists: {derivedArtistNames.join(', ')}</p>
    )}

    <Separator />

    <TextField
      control={control}
      name="displayName"
      label="Display Name (Optional)"
      placeholder="Override display name when featured"
    />
    <p className="-mt-4 text-sm text-zinc-950">
      If not provided, the artist&apos;s default display name will be used.
    </p>

    <FormField
      control={control}
      name="description"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Description (Optional)</FormLabel>
          <FormControl>
            <Textarea
              placeholder="A brief description for when this artist is featured..."
              className="min-h-25"
              {...field}
            />
          </FormControl>
          <FormDescription>Keep it brief. Markdown will be supported post-MVP.</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  </div>
);

interface FeaturedTrackFieldProps {
  control: Control<FeaturedArtistFormData>;
  formatTracks: TrackOption[];
}

const FeaturedTrackField = ({
  control,
  formatTracks,
}: FeaturedTrackFieldProps): React.ReactElement => (
  <FormField
    control={control}
    name="featuredTrackNumber"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Featured Track (Optional)</FormLabel>
        <Select
          value={field.value != null ? String(field.value) : ''}
          onValueChange={(val) => {
            field.onChange(val ? parseInt(val, 10) : undefined);
          }}
        >
          <FormControl>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Default (Track 1)" />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            {formatTracks.map((track) => (
              <SelectItem key={track.trackNumber} value={String(track.trackNumber)}>
                {track.trackNumber}. {getTrackDisplayTitle(track.title, track.fileName)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormDescription>
          Select the track that plays first when a user clicks play. Defaults to track 1.
        </FormDescription>
        <FormMessage />
      </FormItem>
    )}
  />
);
