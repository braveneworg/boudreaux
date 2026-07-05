/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect } from 'react';
import type { JSX } from 'react';

import dynamic from 'next/dynamic';

import { ArtistBioGenerationSection } from '@/app/components/forms/artist-bio-generation-section';
import {
  BioEditorRegistryProvider,
  useBioEditorRegistry,
} from '@/app/components/forms/bio-editor-registry';
import { BioMediaPalettes } from '@/app/components/forms/bio-media-palettes';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import type {
  RichTextEditorImage,
  RichTextEditorUploadHandler,
} from '@/app/components/ui/rich-text-editor';
import type { GeneratedBioContent } from '@/lib/validation/bio-generation-schema';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import type { Editor } from '@tiptap/react';
import type { Control, FieldPath } from 'react-hook-form';

// Admin-only rich-text editor for the bio fields. Lazy + `ssr: false` so the
// Tiptap/ProseMirror bundle never ships to (or runs on) public pages.
const RichTextEditor = dynamic(
  () => import('@/app/components/ui/rich-text-editor').then((mod) => mod.RichTextEditor),
  {
    ssr: false,
    loading: () => <div className="border-input min-h-40 border" aria-busy="true" />,
  }
);

type BioFieldName = Extract<FieldPath<ArtistFormData>, 'bio' | 'shortBio' | 'altBio'>;

interface BioEditorFieldProps {
  control: Control<ArtistFormData>;
  name: BioFieldName;
  label: string;
  ariaLabel: string;
  images: RichTextEditorImage[];
  onUploadImage?: RichTextEditorUploadHandler;
}

const BioEditorField = ({
  control,
  name,
  label,
  ariaLabel,
  images,
  onUploadImage,
}: BioEditorFieldProps): JSX.Element => {
  const registry = useBioEditorRegistry();

  useEffect(() => () => registry.unregister(name), [name, registry]);

  const handleEditorReady = (instance: Editor): void => {
    registry.register(name, instance);
  };

  const handleEditorFocus = (): void => {
    registry.setActive(name);
  };

  return (
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
              onEditorReady={handleEditorReady}
              onEditorFocus={handleEditorFocus}
              onUploadImage={onUploadImage}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

interface ArtistBioSectionProps {
  control: Control<ArtistFormData>;
  isEditMode: boolean;
  artistId: string | null;
  bioEditorImages: RichTextEditorImage[];
  onBioGenerated: (content: GeneratedBioContent) => void;
  onUploadImage?: RichTextEditorUploadHandler;
}

export const ArtistBioSection = ({
  control,
  isEditMode,
  artistId,
  bioEditorImages,
  onBioGenerated,
  onUploadImage,
}: ArtistBioSectionProps): JSX.Element => (
  <section className="space-y-4">
    <h2 className="font-semibold">Biography</h2>

    {/* AI Bio Generation — edit mode only (needs a persisted artist).
        Populates the bio fields below. */}
    {isEditMode && artistId && (
      <ArtistBioGenerationSection artistId={artistId} onGenerated={onBioGenerated} />
    )}

    {/* xl+: editors left (~2/3), palettes in a sticky right rail.
        below xl: palettes above editors (DOM order matches visual order). */}
    <BioEditorRegistryProvider>
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        {isEditMode && artistId && (
          <div
            data-testid="bio-media-rail"
            className="xl:sticky xl:top-24 xl:order-2 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto"
          >
            <BioMediaPalettes artistId={artistId} />
          </div>
        )}
        <div data-testid="bio-editors-column" className="space-y-4 xl:order-1">
          <BioEditorField
            control={control}
            name="bio"
            label="Bio"
            ariaLabel="Bio"
            images={bioEditorImages}
            onUploadImage={onUploadImage}
          />
          <BioEditorField
            control={control}
            name="shortBio"
            label="Short Bio"
            ariaLabel="Short Bio"
            images={bioEditorImages}
            onUploadImage={onUploadImage}
          />
          <BioEditorField
            control={control}
            name="altBio"
            label="Alternative Bio"
            ariaLabel="Alternative Bio"
            images={bioEditorImages}
            onUploadImage={onUploadImage}
          />
        </div>
      </div>
    </BioEditorRegistryProvider>
  </section>
);
