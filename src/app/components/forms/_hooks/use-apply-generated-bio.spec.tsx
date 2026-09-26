// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { queryKeys } from '@/lib/query-keys';
import type { GeneratedBioContent } from '@/lib/validation/bio-generation-schema';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import { useApplyGeneratedBio } from './use-apply-generated-bio';

const ARTIST_ID = 'artist-1';

const generated: GeneratedBioContent = {
  shortBio: '<p>Generated short</p>',
  longBio: '<p>Generated long</p>',
  altBio: '<p>Generated alt</p>',
  genres: 'hip-hop, folk',
  images: [],
  links: [],
  model: 'gemini-2.5-flash',
};

interface HarnessOptions {
  /** `false` leaves the bio fields unregistered, as when no editor is mounted. */
  registerFields?: boolean;
}

const renderApply = ({ registerFields = true }: HarnessOptions = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.artists.detail(ARTIST_ID), { id: ARTIST_ID, bio: 'old' });
  let formRef: UseFormReturn<ArtistFormData> | undefined;
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientTestWrapper';
  const hook = renderHook(
    () => {
      const form = useForm<ArtistFormData>({
        defaultValues: {
          firstName: 'Old',
          shortBio: 'old short',
          bio: 'old long',
          altBio: 'old alt',
          genres: 'old genres',
        },
      });
      if (registerFields) {
        // The real form registers these through their controllers; `resetField`
        // is a no-op on an unregistered field.
        form.register('firstName');
        form.register('shortBio');
        form.register('bio');
        form.register('altBio');
        form.register('genres');
      }
      formRef = form;
      const applyGeneratedBio = useApplyGeneratedBio({ form, artistId: ARTIST_ID });
      // Read during render so the formState proxy tracks it for assertions.
      return { applyGeneratedBio, isDirty: form.formState.isDirty };
    },
    { wrapper: Wrapper }
  );
  const getForm = (): UseFormReturn<ArtistFormData> => {
    if (!formRef) throw new Error('form not rendered');
    return formRef;
  };
  return { ...hook, client, getForm };
};

describe('useApplyGeneratedBio', () => {
  it('writes the generated bios and genres into the form', async () => {
    const { result, getForm } = renderApply();

    await act(async () => result.current.applyGeneratedBio(generated));

    expect(getForm().getValues(['shortBio', 'bio', 'altBio', 'genres'])).toEqual([
      '<p>Generated short</p>',
      '<p>Generated long</p>',
      '<p>Generated alt</p>',
      'hip-hop, folk',
    ]);
  });

  it('leaves the form clean, because the job already persisted the content', async () => {
    const { result } = renderApply();

    await act(async () => result.current.applyGeneratedBio(generated));

    expect(result.current.isDirty).toBe(false);
  });

  it('adopts the generated content as the baseline a later reset returns to', async () => {
    const { result, getForm } = renderApply();

    await act(async () => result.current.applyGeneratedBio(generated));
    await act(async () => getForm().resetField('bio'));

    expect(getForm().getValues('bio')).toBe('<p>Generated long</p>');
  });

  it('overwrites an unsaved hand edit to a bio field', async () => {
    const { result, getForm } = renderApply();
    await act(async () => getForm().setValue('bio', 'hand edit', { shouldDirty: true }));

    await act(async () => result.current.applyGeneratedBio(generated));

    expect(getForm().getValues('bio')).toBe('<p>Generated long</p>');
  });

  it('keeps an unsaved edit to an unrelated field', async () => {
    const { result, getForm } = renderApply();
    await act(async () => getForm().setValue('firstName', 'Edited', { shouldDirty: true }));

    await act(async () => result.current.applyGeneratedBio(generated));

    expect(getForm().getValues('firstName')).toBe('Edited');
  });

  it('keeps the form dirty while an unrelated field is still unsaved', async () => {
    const { result, getForm } = renderApply();
    await act(async () => getForm().setValue('firstName', 'Edited', { shouldDirty: true }));

    await act(async () => result.current.applyGeneratedBio(generated));

    expect(result.current.isDirty).toBe(true);
  });

  it('keeps the existing genres when the run produced none', async () => {
    const { result, getForm } = renderApply();

    await act(async () => result.current.applyGeneratedBio({ ...generated, genres: null }));

    expect(getForm().getValues('genres')).toBe('old genres');
  });

  it('does not overwrite genres an admin is already editing', async () => {
    const { result, getForm } = renderApply();

    await act(async () => {
      getForm().setValue('genres', 'my-own-pick', { shouldDirty: true });
    });
    await act(async () => result.current.applyGeneratedBio(generated));

    expect(getForm().getValues('genres')).toBe('my-own-pick');
  });

  it('adopts generated genres while the field is untouched', async () => {
    const { result, getForm } = renderApply();

    await act(async () => result.current.applyGeneratedBio(generated));

    expect(getForm().getValues('genres')).toBe('hip-hop, folk');
  });

  it('still adopts the bios when only genres are dirty', async () => {
    const { result, getForm } = renderApply();

    await act(async () => {
      getForm().setValue('genres', 'my-own-pick', { shouldDirty: true });
    });
    await act(async () => result.current.applyGeneratedBio(generated));

    expect(getForm().getValues('shortBio')).toBe(generated.shortBio);
  });

  it('marks the cached artist detail stale so a revisit refetches the saved bios', async () => {
    const { result, client } = renderApply();

    await act(async () => result.current.applyGeneratedBio(generated));

    expect(client.getQueryState(queryKeys.artists.detail(ARTIST_ID))?.isInvalidated).toBe(true);
  });

  it('still fills the form, left dirty so Save stays available, when no field is registered', async () => {
    const { result, getForm } = renderApply({ registerFields: false });

    await act(async () => result.current.applyGeneratedBio(generated));

    expect({ bio: getForm().getValues('bio'), isDirty: result.current.isDirty }).toEqual({
      bio: '<p>Generated long</p>',
      isDirty: true,
    });
  });
});
