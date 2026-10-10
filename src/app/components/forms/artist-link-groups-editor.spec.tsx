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
  // Read during render, as the real form does for its Save button, so the
  // form state is subscribed and a typed character reaches it.
  const { isDirty } = form.formState;
  return (
    <Form {...form}>
      <ArtistLinkGroupsEditor control={form.control} />
      <button type="button" onClick={() => onRead(form.getValues('contactLinkGroups'), isDirty)}>
        read
      </button>
    </Form>
  );
};

const GROUPS = [
  {
    heading: 'Booking',
    links: [
      { label: 'Agency', description: 'Books US tours', url: 'mailto:booking@example.com' },
      { label: 'Office', description: '', url: 'tel:+18605550134' },
    ],
  },
  { heading: 'Merch', links: [] },
  {
    heading: 'Press',
    links: [{ label: '', description: 'Press kit', url: 'https://example.com/press' }],
  },
];

interface ReadGroup {
  heading: string;
  links: { description?: string; url: string }[];
}

const renderEditor = (groups: HarnessProps['groups'] = GROUPS) => {
  const onRead = vi.fn();
  render(<Harness groups={groups} onRead={onRead} />);
  const user = userEvent.setup({ delay: null });
  const read = async () => {
    await user.click(screen.getByRole('button', { name: 'read' }));
    return onRead.mock.calls.at(-1) as [ReadGroup[], boolean];
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
    expect(values.map(({ links }) => links.length)).toEqual([2, 1, 1]);
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

  describe('link description', () => {
    it('shows the stored description of a link', () => {
      renderEditor();

      const description = screen.getByRole('textbox', { name: 'Group 1 link 1 description' });
      expect(description).toHaveValue('Books US tours');
      expect(description).toHaveAttribute('placeholder', 'Description (optional)');
    });

    it('writes what is typed to that row and dirties the form', async () => {
      const { user, read } = renderEditor();

      await user.type(
        screen.getByRole('textbox', { name: 'Group 1 link 2 description' }),
        'After 5pm'
      );

      const [values, isDirty] = await read();
      expect(values[0].links.map(({ description }) => description)).toEqual([
        'Books US tours',
        'After 5pm',
      ]);
      expect(isDirty).toBe(true);
    });

    // A stored `null` loads as an empty string, which is the field's default.
    it('is pristine when loaded with descriptions', async () => {
      const { contactLinkGroups } = toArtistLinksFormValues({
        websites: [],
        social: [],
        contact: [
          {
            heading: 'Booking',
            links: [
              { label: 'Agency', description: 'Books US tours', url: 'mailto:a@example.com' },
              { label: null, description: null, url: 'tel:+18605550134' },
            ],
          },
        ],
      });
      const { read } = renderEditor(contactLinkGroups);

      const [, isDirty] = await read();
      expect(screen.getByRole('textbox', { name: 'Group 1 link 2 description' })).toHaveValue('');
      expect(isDirty).toBe(false);
    });

    it('starts an added link with an empty description', async () => {
      const { user, read } = renderEditor();

      await user.click(screen.getByRole('button', { name: 'Add link to group 1' }));

      expect(screen.getByRole('textbox', { name: 'Group 1 link 3 description' })).toHaveValue('');
      const [values] = await read();
      expect(values[0].links.at(-1)).toEqual({ label: '', description: '', url: '' });
    });

    it('carries the description with a link that moves', async () => {
      const { user, read } = renderEditor();

      await user.click(screen.getByRole('button', { name: 'Move group 1 link 1 later' }));

      expect(screen.getByRole('textbox', { name: 'Group 1 link 1 description' })).toHaveValue('');
      expect(screen.getByRole('textbox', { name: 'Group 1 link 2 description' })).toHaveValue(
        'Books US tours'
      );
      const [values] = await read();
      expect(values[0].links.map(({ description }) => description)).toEqual(['', 'Books US tours']);
    });

    it('carries the description with a group that moves', async () => {
      const { user, read } = renderEditor();

      await user.click(screen.getByRole('button', { name: 'Move group 1 later' }));

      expect(screen.getByRole('textbox', { name: 'Group 2 link 1 description' })).toHaveValue(
        'Books US tours'
      );
      const [values] = await read();
      expect(values[1].links.map(({ description }) => description)).toEqual(['Books US tours', '']);
    });

    it('keeps each description on its row when a link is removed', async () => {
      const { user, read } = renderEditor();

      await user.click(screen.getByRole('button', { name: 'Remove group 1 link 2' }));

      expect(screen.getByRole('textbox', { name: 'Group 1 link 1 description' })).toHaveValue(
        'Books US tours'
      );
      const [values] = await read();
      expect(values[0].links.map(({ description }) => description)).toEqual(['Books US tours']);
    });

    it('keeps each description on its row when a group is removed', async () => {
      const { user, read } = renderEditor();

      await user.click(screen.getByRole('button', { name: 'Remove group 1' }));

      expect(screen.getByRole('textbox', { name: 'Group 2 link 1 description' })).toHaveValue(
        'Press kit'
      );
      const [values] = await read();
      expect(values.map(({ links }) => links.map(({ description }) => description))).toEqual([
        [],
        ['Press kit'],
      ]);
    });
  });
});
