// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { useApplyGeneratedBio } from '@/app/components/forms/_hooks/use-apply-generated-bio';
import type { GeneratedBioContent } from '@/lib/validation/bio-generation-schema';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import { useVocabularyField } from './use-vocabulary-field';

/**
 * Integration net for the seam the pill editor introduced.
 *
 * `useApplyGeneratedBio` adopts persisted content with `setValue(…, {
 * shouldDirty: true })` followed by `resetField(name, { defaultValue })` — the
 * reset is what returns the form to pristine, because the job already SAVED
 * what it generated and there is nothing for the admin to keep.
 *
 * `resetField` is a no-op on a field nothing has registered. Genres used to be
 * registered by a `<TextField>`'s Controller; the pill editor replaced it, so
 * this file pins that `useVocabularyField` still registers the field. Without
 * it the form stays dirty after a generation and Save never disables —
 * exactly what `admin-artist-bio-generation.spec.ts:109` asserts.
 *
 * Crucially this harness does NOT call `form.register('genres')`. The hook
 * under test is the only thing that may register it; a manual register here
 * would simulate the Controller that no longer exists and hide the bug.
 */
const generated: GeneratedBioContent = {
  shortBio: '<p>Generated short</p>',
  longBio: '<p>Generated long</p>',
  altBio: '<p>Generated alt</p>',
  genres: 'hip-hop, folk',
  images: [],
  links: [],
  model: 'gemini-2.5-flash',
};

const renderFormWithPillEditor = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientTestWrapper';

  let formRef: UseFormReturn<ArtistFormData> | undefined;

  const hook = renderHook(
    () => {
      const form = useForm<ArtistFormData>({
        defaultValues: { genres: 'indie-rock' } as Partial<ArtistFormData> as ArtistFormData,
      });
      formRef = form;

      // The bio editors register these in the real form; adoption writes all
      // four, so leaving them unregistered here would keep the form dirty for
      // a reason that has nothing to do with the field under test.
      form.register('shortBio');
      form.register('bio');
      form.register('altBio');

      // genres is deliberately NOT registered here — the hook under test is
      // the only thing allowed to register it, and the real form drives genres
      // ONLY through this hook.
      const genres = useVocabularyField({ control: form.control, name: 'genres' });
      const applyGeneratedBio = useApplyGeneratedBio({ form, artistId: null });

      return { genres, applyGeneratedBio, isDirty: form.formState.isDirty };
    },
    { wrapper: Wrapper }
  );

  const getForm = (): UseFormReturn<ArtistFormData> => {
    if (!formRef) throw new Error('form not rendered');
    return formRef;
  };

  return { ...hook, getForm };
};

describe('useVocabularyField + generated-bio adoption', () => {
  it('leaves the form pristine after adopting generated genres', async () => {
    const { result } = renderFormWithPillEditor();

    await act(async () => result.current.applyGeneratedBio(generated));

    expect(result.current.isDirty).toBe(false);
  });

  it('adopts the generated genres into the pills', async () => {
    const { result } = renderFormWithPillEditor();

    await act(async () => result.current.applyGeneratedBio(generated));

    expect(result.current.genres.terms).toEqual(['hip-hop', 'folk']);
  });

  it('takes the adopted value as the new default, so a later reset keeps it', async () => {
    const { result, getForm } = renderFormWithPillEditor();

    await act(async () => result.current.applyGeneratedBio(generated));
    act(() => getForm().reset());

    expect(getForm().getValues('genres')).toBe('hip-hop, folk');
  });

  it('still marks the form dirty when the admin edits the pills themselves', async () => {
    const { result } = renderFormWithPillEditor();

    await act(async () => {
      result.current.genres.setTerms(['noise']);
    });

    expect(result.current.isDirty).toBe(true);
  });

  it('does not adopt over pills the admin is already editing', async () => {
    const { result } = renderFormWithPillEditor();

    await act(async () => {
      result.current.genres.setTerms(['my-own-pick']);
    });
    await act(async () => result.current.applyGeneratedBio(generated));

    expect(result.current.genres.terms).toEqual(['my-own-pick']);
  });
});
