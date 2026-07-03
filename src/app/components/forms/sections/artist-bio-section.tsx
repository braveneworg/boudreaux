/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import dynamic from 'next/dynamic';

import { ArtistBioGenerationSection } from '@/app/components/forms/artist-bio-generation-section';
import { BioMediaPalettes } from '@/app/components/forms/bio-media-palettes';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import type { RichTextEditorImage } from '@/app/components/ui/rich-text-editor';
import type { GeneratedBioContent } from '@/lib/validation/bio-generation-schema';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import type { Control, FieldPath } from 'react-hook-form';

// Admin-only rich-text editor for the bio fields. Lazy + `ssr: false` so the
// Tiptap/ProseMirror bundle never ships to (or runs on) public pages.
const RichTextEditor = dynamic(
  () => import('@/app/components/ui/rich-text-editor').then((mod) => mod.RichTextEditor),
  {
    ssr: false,
    loading: () => <div className="border-input min-h-40 rounded-md border" aria-busy="true" />,
  }
);

type BioFieldName = Extract<FieldPath<ArtistFormData>, 'bio' | 'shortBio' | 'altBio'>;

interface BioEditorFieldProps {
  control: Control<ArtistFormData>;
  name: BioFieldName;
  label: string;
  ariaLabel: string;
  images: RichTextEditorImage[];
}

const BioEditorField = ({
  control,
  name,
  label,
  ariaLabel,
  images,
}: BioEditorFieldProps): React.ReactElement => (
  <FormField
    control={control}
    name={name}
    render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl>
          <RichTextEditor
            value={field.value ?? ''}
            onChange={field.onChange}
            images={images}
            ariaLabel={ariaLabel}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
);

interface ArtistBioSectionProps {
  control: Control<ArtistFormData>;
  isEditMode: boolean;
  artistId: string | null;
  bioEditorImages: RichTextEditorImage[];
  onBioGenerated: (content: GeneratedBioContent) => void;
}

export const ArtistBioSection = ({
  control,
  isEditMode,
  artistId,
  bioEditorImages,
  onBioGenerated,
}: ArtistBioSectionProps): React.ReactElement => (
  <section className="space-y-4">
    <h2 className="font-semibold">Biography</h2>

    {/* AI Bio Generation — first action; edit mode only (needs a persisted
        artist). Populates the bio fields below. The palettes surface the
        persisted discovered links/images so tiles drag into the editors. */}
    {isEditMode && artistId && (
      <>
        <ArtistBioGenerationSection artistId={artistId} onGenerated={onBioGenerated} />
        <BioMediaPalettes artistId={artistId} />
      </>
    )}

    <BioEditorField
      control={control}
      name="bio"
      label="Bio"
      ariaLabel="Bio"
      images={bioEditorImages}
    />
    <BioEditorField
      control={control}
      name="shortBio"
      label="Short Bio"
      ariaLabel="Short Bio"
      images={bioEditorImages}
    />
    <BioEditorField
      control={control}
      name="altBio"
      label="Alternative Bio"
      ariaLabel="Alternative Bio"
      images={bioEditorImages}
    />
  </section>
);
