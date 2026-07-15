// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { useVideoArtistFields } from './use-video-artist-fields';

vi.mock('server-only', () => ({}));

/**
 * Renders the hook wired into a real RHF form instance. To ensure `useWatch`
 * receives the initial artist value, the artist string is set via `form.setValue`
 * inside `act` after mounting (RHF's `defaultValues` is not propagated to
 * `useWatch` until after the first store subscription settles in test environments).
 */
const renderWithArtist = (initialArtist: string) => {
  const { result } = renderHook(() => {
    const form = useForm<VideoFormData>({ defaultValues: { artist: '' } });
    const fields = useVideoArtistFields({ control: form.control, setValue: form.setValue });
    return { form, fields };
  });

  // Push the initial artist value through the RHF store so useWatch picks it up.
  if (initialArtist !== '') {
    act(() => {
      result.current.form.setValue('artist', initialArtist);
    });
  }

  return result;
};

describe('useVideoArtistFields', () => {
  it('derives primary and featured from the artist string', () => {
    const result = renderWithArtist('X feat. Y');

    expect(result.current.fields.primary).toBe('X');
    expect(result.current.fields.featured).toEqual(['Y']);
  });

  it('returns empty primary and featured for an empty artist string', () => {
    const result = renderWithArtist('');

    expect(result.current.fields.primary).toBe('');
    expect(result.current.fields.featured).toEqual([]);
  });

  it('returns single primary and no featured for a plain name', () => {
    const result = renderWithArtist('Ceschi');

    expect(result.current.fields.primary).toBe('Ceschi');
    expect(result.current.fields.featured).toEqual([]);
  });

  it('setPrimary recomposes the artist string preserving featured', () => {
    const result = renderWithArtist('X feat. Y');

    act(() => {
      result.current.fields.setPrimary('Z');
    });

    expect(result.current.form.getValues('artist')).toBe('Z feat. Y');
  });

  it('setFeatured recomposes the artist string preserving primary', () => {
    const result = renderWithArtist('X');

    act(() => {
      result.current.fields.setFeatured(['A', 'B']);
    });

    expect(result.current.form.getValues('artist')).toBe('X feat. A feat. B');
  });

  it('setPrimary with empty string clears the artist field', () => {
    const result = renderWithArtist('X feat. Y');

    act(() => {
      result.current.fields.setPrimary('');
    });

    expect(result.current.form.getValues('artist')).toBe('');
  });

  it('setFeatured with empty array removes featured names from artist string', () => {
    const result = renderWithArtist('X feat. Y feat. Z');

    act(() => {
      result.current.fields.setFeatured([]);
    });

    expect(result.current.form.getValues('artist')).toBe('X');
  });

  it('treats an undefined artist value as empty (nullish fallback)', () => {
    // A form with no `artist` default: `useWatch` yields `undefined` after the
    // first render, exercising the `artist ?? ''` fallback in the hook.
    const { result } = renderHook(() => {
      const form = useForm<VideoFormData>();
      const fields = useVideoArtistFields({ control: form.control, setValue: form.setValue });
      return { form, fields };
    });

    expect(result.current.fields.primary).toBe('');
    expect(result.current.fields.featured).toEqual([]);
  });
});
