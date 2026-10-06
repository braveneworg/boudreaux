/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { Form } from '@/app/components/ui/form';
import { toArtistLinksFormValues } from '@/lib/utils/artist-links';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import { ArtistLinksSection } from './artist-links-section';

const Harness = (): React.ReactElement => {
  const form = useForm<ArtistFormData>({
    defaultValues: toArtistLinksFormValues(null) as ArtistFormData,
  });
  return (
    <Form {...form}>
      <ArtistLinksSection control={form.control} />
    </Form>
  );
};

describe('ArtistLinksSection', () => {
  it('is a labelled region with the three link sections', () => {
    render(<Harness />);

    const section = screen.getByRole('region', { name: 'Links' });
    expect(within(section).getByRole('group', { name: 'Websites' })).toBeInTheDocument();
    expect(within(section).getByRole('group', { name: 'Social Media' })).toBeInTheDocument();
    expect(within(section).getByRole('group', { name: 'Contact & Misc' })).toBeInTheDocument();
  });

  it('offers an add button per flat section and the prefilled contact groups', () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: 'Add website link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add social link' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Group 1 heading' })).toHaveValue('Booking');
    expect(screen.getByRole('textbox', { name: 'Group 2 heading' })).toHaveValue('Merch');
  });
});
