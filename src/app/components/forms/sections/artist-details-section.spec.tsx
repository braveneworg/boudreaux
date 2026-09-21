/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { Form } from '@/app/components/ui/form';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import { ArtistDetailsSection } from './artist-details-section';

// The pill editor has its own spec; here we only prove it is wired in with the
// right field, label and highlight cutoff.
vi.mock('@/app/components/forms/fields/vocabulary-multi-combobox', () => ({
  VocabularyMultiCombobox: ({
    field,
    label,
    value,
    highlightCount,
  }: {
    field: string;
    label: string;
    value: string[];
    highlightCount?: number;
  }) => (
    <div
      data-testid={`vocabulary-${field}`}
      data-label={label}
      data-value={value.join(',')}
      data-highlight={highlightCount ?? ''}
    />
  ),
}));

const Harness = ({ genres, tags }: { genres?: string; tags?: string }): React.ReactElement => {
  const form = useForm<ArtistFormData>({
    defaultValues: { genres, tags } as Partial<ArtistFormData> as ArtistFormData,
  });

  return (
    <Form {...form}>
      <ArtistDetailsSection
        control={form.control}
        setValue={form.setValue}
        isNameRequired={false}
      />
    </Form>
  );
};

describe('ArtistDetailsSection', () => {
  it('renders the genres pill editor', () => {
    render(<Harness />);

    expect(screen.getByTestId('vocabulary-genres')).toBeInTheDocument();
  });

  it('renders the tags pill editor', () => {
    render(<Harness />);

    expect(screen.getByTestId('vocabulary-tags')).toBeInTheDocument();
  });

  it('labels the genres editor', () => {
    render(<Harness />);

    expect(screen.getByTestId('vocabulary-genres')).toHaveAttribute('data-label', 'Genres');
  });

  it('caps the genres highlight at the three shown on artist cards', () => {
    render(<Harness />);

    expect(screen.getByTestId('vocabulary-genres')).toHaveAttribute('data-highlight', '3');
  });

  it('mutes nothing in the tags editor, which never reaches a card', () => {
    render(<Harness />);

    expect(screen.getByTestId('vocabulary-tags')).toHaveAttribute('data-highlight', '');
  });

  it('seeds the genres editor from the form value', () => {
    render(<Harness genres="indie-rock,post-punk" />);

    expect(screen.getByTestId('vocabulary-genres')).toHaveAttribute(
      'data-value',
      'indie-rock,post-punk'
    );
  });

  it('seeds the tags editor from the form value', () => {
    render(<Harness tags="experimental" />);

    expect(screen.getByTestId('vocabulary-tags')).toHaveAttribute('data-value', 'experimental');
  });

  it('still renders the slug field the editors sit below', () => {
    render(<Harness />);

    expect(screen.getByLabelText(/slug/i)).toBeInTheDocument();
  });
});
