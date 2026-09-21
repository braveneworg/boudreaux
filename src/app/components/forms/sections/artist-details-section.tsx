/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { TextField } from '@/app/components/forms/fields';
import { useVocabularyField } from '@/app/components/forms/fields/use-vocabulary-field';
import { VocabularyMultiCombobox } from '@/app/components/forms/fields/vocabulary-multi-combobox';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import type { Control, UseFormSetValue } from 'react-hook-form';

/** Genres shown on an artist card — the rest render muted in the editor. */
const CARD_GENRE_COUNT = 3;

interface ArtistDetailsSectionProps {
  control: Control<ArtistFormData>;
  setValue: UseFormSetValue<ArtistFormData>;
  isNameRequired: boolean;
}

export const ArtistDetailsSection = ({
  control,
  setValue,
  isNameRequired,
}: ArtistDetailsSectionProps): React.ReactElement => {
  const genres = useVocabularyField({ control, setValue, name: 'genres' });
  const tags = useVocabularyField({ control, setValue, name: 'tags' });

  return (
    <section className="space-y-4 pt-0">
      <h2 className="font-semibold">Artist Details</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          control={control}
          name="title"
          label="Title"
          placeholder="e.g., Dr., Prof., DJ"
        />
        <TextField
          control={control}
          name="firstName"
          label={`First Name${isNameRequired ? ' *' : ''}`}
          placeholder="First name"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          control={control}
          name="middleName"
          label="Middle Name"
          placeholder="Middle name"
        />
        <TextField
          control={control}
          name="surname"
          label={`Surname${isNameRequired ? ' *' : ''}`}
          placeholder="Last name"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          control={control}
          name="suffix"
          label="Suffix"
          placeholder="e.g., Jr., Sr., III"
        />
        <TextField
          control={control}
          name="displayName"
          label="Display Name"
          placeholder="Public display name (optional)"
        />
      </div>
      <TextField
        control={control}
        name="akaNames"
        label="AKA Names"
        placeholder="Also known as (comma-separated)"
      />
      <TextField
        control={control}
        name="slug"
        label="Slug *"
        placeholder="url-friendly-identifier"
      />
      <VocabularyMultiCombobox
        field="genres"
        label="Genres"
        value={genres.terms}
        onChange={genres.setTerms}
        highlightCount={CARD_GENRE_COUNT}
      />
      <VocabularyMultiCombobox
        field="tags"
        label="Tags"
        value={tags.terms}
        onChange={tags.setTerms}
        helperText="Admin-only filing terms; tags never appear on public pages."
      />
    </section>
  );
};
