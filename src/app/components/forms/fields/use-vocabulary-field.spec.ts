/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import { useVocabularyField } from './use-vocabulary-field';

/**
 * Seeds the value through `useForm({ defaultValues })` — never `setValue` —
 * so a hook that wrongly passed `defaultValue` to `useWatch` would read the
 * placeholder and fail here, per
 * `docs/lessons/react-nextjs/usewatch-defaultvalue-masks-form-defaults.md`.
 */
const renderField = (genres?: string) =>
  renderHook(() => {
    const form = useForm<ArtistFormData>({
      defaultValues: { genres } as Partial<ArtistFormData> as ArtistFormData,
    });
    // Mirrors the real <Controller>; resetField/setValue are no-ops otherwise.
    form.register('genres');
    // `formState` is a subscription proxy: dirtyFields is only tracked when it
    // is READ during render, so touch it here the way a real form does.
    const { dirtyFields } = form.formState;

    void dirtyFields;

    return {
      field: useVocabularyField({ control: form.control, name: 'genres' }),
      form,
    };
  });

describe('useVocabularyField', () => {
  it('decodes the comma-joined default value on first render', () => {
    const { result } = renderField('indie-rock,post-punk');

    expect(result.current.field.terms).toEqual(['indie-rock', 'post-punk']);
  });

  it('trims whitespace around stored terms', () => {
    const { result } = renderField('indie-rock, post-punk');

    expect(result.current.field.terms).toEqual(['indie-rock', 'post-punk']);
  });

  it('yields an empty list when the field is undefined', () => {
    const { result } = renderField();

    expect(result.current.field.terms).toEqual([]);
  });

  it('yields an empty list when the field is an empty string', () => {
    const { result } = renderField('');

    expect(result.current.field.terms).toEqual([]);
  });

  it('writes the terms back as a comma-joined string', () => {
    const { result } = renderField('indie-rock');

    act(() => {
      result.current.field.setTerms(['indie-rock', 'noise']);
    });

    expect(result.current.form.getValues('genres')).toBe('indie-rock,noise');
  });

  it('reflects the written value back through terms', () => {
    const { result } = renderField('indie-rock');

    act(() => {
      result.current.field.setTerms(['noise', 'drone']);
    });

    expect(result.current.field.terms).toEqual(['noise', 'drone']);
  });

  it('writes an empty string when every term is removed', () => {
    const { result } = renderField('indie-rock');

    act(() => {
      result.current.field.setTerms([]);
    });

    expect(result.current.form.getValues('genres')).toBe('');
  });

  it('marks the form dirty so the save button enables', () => {
    const { result } = renderField('indie-rock');

    act(() => {
      result.current.field.setTerms(['indie-rock', 'noise']);
    });

    expect(result.current.form.formState.dirtyFields.genres).toBe(true);
  });

  it('normalises terms on the way in', () => {
    const { result } = renderField();

    act(() => {
      result.current.field.setTerms(['Indie Rock']);
    });

    expect(result.current.form.getValues('genres')).toBe('indie-rock');
  });

  it('drops a duplicate that differs only by case', () => {
    const { result } = renderField();

    act(() => {
      result.current.field.setTerms(['Punk', 'punk']);
    });

    expect(result.current.field.terms).toEqual(['punk']);
  });
});
