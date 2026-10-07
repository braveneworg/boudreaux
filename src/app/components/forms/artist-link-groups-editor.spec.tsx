/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import { Form } from '@/app/components/ui/form';
import { toArtistLinksFormValues } from '@/lib/utils/artist-links';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import { ArtistLinkGroupsEditor } from './artist-link-groups-editor';

interface HarnessProps {
  groups: NonNullable<ArtistFormData['contactLinkGroups']>;
  onRead: (values: unknown, isDirty: boolean) => void;
}

const Harness = ({ groups, onRead }: HarnessProps): React.ReactElement => {
  const form = useForm<ArtistFormData>({
    defaultValues: { contactLinkGroups: groups } as ArtistFormData,
  });
  return (
    <Form {...form}>
      <ArtistLinkGroupsEditor control={form.control} />
      <button
        type="button"
        onClick={() => onRead(form.getValues('contactLinkGroups'), form.formState.isDirty)}
      >
        read
      </button>
    </Form>
  );
};

const GROUPS = [
  { heading: 'Booking', links: [{ label: 'Agency', url: 'mailto:booking@example.com' }] },
  { heading: 'Merch', links: [] },
  { heading: 'Press', links: [{ label: '', url: 'https://example.com/press' }] },
];

const renderEditor = (groups: HarnessProps['groups'] = GROUPS) => {
  const onRead = vi.fn();
  render(<Harness groups={groups} onRead={onRead} />);
  const user = userEvent.setup({ delay: null });
  const read = async () => {
    await user.click(screen.getByRole('button', { name: 'read' }));
    return onRead.mock.calls.at(-1) as [{ heading: string; links: { url: string }[] }[], boolean];
  };
  return { user, read };
};

describe('ArtistLinkGroupsEditor', () => {
  it('renders a group per heading with its links', () => {
    renderEditor();

    expect(screen.getByRole('textbox', { name: 'Group 1 heading' })).toHaveValue('Booking');
    expect(screen.getByRole('textbox', { name: 'Group 3 heading' })).toHaveValue('Press');
    const booking = screen.getByRole('group', { name: 'Booking' });
    expect(within(booking).getByRole('textbox', { name: 'Group 1 link 1 URL' })).toHaveValue(
      'mailto:booking@example.com'
    );
    expect(
      within(screen.getByRole('group', { name: 'Merch' })).getByText('No links yet.')
    ).toBeInTheDocument();
  });

  it('appends a group with an empty heading and no links', async () => {
    const { user, read } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Add group' }));

    expect(screen.getByRole('textbox', { name: 'Group 4 heading' })).toHaveValue('');
    const [values] = await read();
    expect(values.at(-1)).toEqual({ heading: '', links: [] });
  });

  it('adds a link to one group only', async () => {
    const { user, read } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Add link to group 2' }));

    const [values] = await read();
    expect(values.map(({ links }) => links.length)).toEqual([1, 1, 1]);
  });

  it('removes a group', async () => {
    const { user, read } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Remove group 2' }));

    const [values] = await read();
    expect(values.map(({ heading }) => heading)).toEqual(['Booking', 'Press']);
  });

  it('moves a group later and announces it politely', async () => {
    const { user, read } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Move group 1 later' }));

    const [values] = await read();
    expect(values.map(({ heading }) => heading)).toEqual(['Merch', 'Booking', 'Press']);
    expect(screen.getByText('Booking is now group 2 of 3')).toHaveAttribute('aria-live', 'polite');
  });

  // ADR-0020: the editor prefills Booking and Merch for an artist with no
  // links; they are default values, so the form is not dirty.
  it('leaves the form pristine with the prefilled groups', async () => {
    const { read } = renderEditor(toArtistLinksFormValues(null).contactLinkGroups);

    const [values, isDirty] = await read();
    expect(values.map(({ heading }) => heading)).toEqual(['Booking', 'Merch']);
    expect(isDirty).toBe(false);
  });

  it('names an unnamed group by its position', () => {
    renderEditor([{ heading: '', links: [] }]);

    expect(screen.getByRole('group', { name: 'Group 1' })).toBeInTheDocument();
  });
});
