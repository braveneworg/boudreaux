/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import { Form } from '@/app/components/ui/form';
import { MAX_ARTIST_LINK_DESCRIPTION_LENGTH } from '@/lib/validation/artist-links-schema';
import { createArtistSchema } from '@/lib/validation/create-artist-schema';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import { ArtistLinkListEditor, type ArtistLinkListTarget } from './artist-link-list-editor';

interface HarnessProps {
  target?: ArtistLinkListTarget;
  heading?: string;
  defaults?: Partial<ArtistFormData>;
  onRead: (values: unknown, isDirty: boolean) => void;
}

const Harness = ({
  target = { name: 'websiteLinks', section: 'websites' },
  heading = 'Website',
  defaults = {},
  onRead,
}: HarnessProps): React.ReactElement => {
  const form = useForm<ArtistFormData>({
    resolver: zodResolver(createArtistSchema),
    defaultValues: defaults as ArtistFormData,
  });
  const { name } = target;
  return (
    <Form {...form}>
      <ArtistLinkListEditor
        control={form.control}
        {...target}
        heading={heading}
        addLabel="Add website link"
      />
      <button type="button" onClick={() => onRead(form.getValues(name), form.formState.isDirty)}>
        read
      </button>
      <button
        type="button"
        onClick={() => form.setError(`${name}.0.url`, { message: 'Must be an http(s) URL' })}
      >
        fail
      </button>
      <button type="button" onClick={() => void form.trigger(name)}>
        validate
      </button>
    </Form>
  );
};

const LINKS = [
  { label: 'Official site', url: 'https://example.com' },
  { label: '', url: 'https://example.bandcamp.com' },
  { label: 'Label page', url: 'https://fakefourinc.com/x' },
];

const renderEditor = (props: Partial<HarnessProps> = {}) => {
  const onRead = vi.fn();
  render(<Harness defaults={{ websiteLinks: LINKS }} onRead={onRead} {...props} />);
  const user = userEvent.setup({ delay: null });
  const read = async () => {
    await user.click(screen.getByRole('button', { name: 'read' }));
    return onRead.mock.calls.at(-1) as [unknown, boolean];
  };
  return { user, read };
};

const urlsOf = (values: unknown): string[] => (values as { url: string }[]).map(({ url }) => url);

const CONTACT_TARGET: ArtistLinkListTarget = {
  name: 'contactLinkGroups.0.links',
  section: 'contact',
};

/** A Contact & Misc list, as the groups editor renders one: "Group 1 link 2". */
const renderContactEditor = (
  links: NonNullable<ArtistFormData['contactLinkGroups']>[number]['links']
) =>
  renderEditor({
    target: CONTACT_TARGET,
    heading: 'Group 1',
    defaults: { contactLinkGroups: [{ heading: 'Booking', links }] },
  });

describe('ArtistLinkListEditor', () => {
  it('renders a label and a URL input per link, in order', () => {
    renderEditor();

    const rows = within(screen.getByRole('list', { name: 'Website links' })).getAllByRole(
      'listitem'
    );
    expect(rows).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: 'Website link 1 label' })).toHaveValue(
      'Official site'
    );
    expect(screen.getByRole('textbox', { name: 'Website link 2 URL' })).toHaveValue(
      'https://example.bandcamp.com'
    );
  });

  it('invites the first link when there are none', () => {
    renderEditor({ defaults: { websiteLinks: [] } });

    expect(screen.getByText('No website links yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add website link' })).toBeEnabled();
  });

  it('appends an empty row', async () => {
    const { user, read } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Add website link' }));

    expect(screen.getByRole('textbox', { name: 'Website link 4 URL' })).toHaveValue('');
    const [values] = await read();
    expect(urlsOf(values)).toEqual([
      'https://example.com',
      'https://example.bandcamp.com',
      'https://fakefourinc.com/x',
      '',
    ]);
    expect((values as unknown[]).at(-1)).toEqual({ label: '', url: '' });
  });

  it('removes a row', async () => {
    const { user, read } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Remove website link 2' }));

    const [values] = await read();
    expect(urlsOf(values)).toEqual(['https://example.com', 'https://fakefourinc.com/x']);
  });

  it('moves a link later and announces its new position politely', async () => {
    const { user, read } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Move website link 1 later' }));

    const [values] = await read();
    expect(urlsOf(values)).toEqual([
      'https://example.bandcamp.com',
      'https://example.com',
      'https://fakefourinc.com/x',
    ]);
    expect(screen.getByText('Official site is now website link 2 of 3')).toHaveAttribute(
      'aria-live',
      'polite'
    );
  });

  it('moves a link with the arrow keys while a move button has focus', async () => {
    const { user, read } = renderEditor();

    screen.getByRole('button', { name: 'Move website link 3 earlier' }).focus();
    await user.keyboard('{ArrowUp}');

    const [values] = await read();
    expect(urlsOf(values)).toEqual([
      'https://example.com',
      'https://fakefourinc.com/x',
      'https://example.bandcamp.com',
    ]);
  });

  it('disables moving the first link earlier and the last link later', () => {
    renderEditor();

    expect(screen.getByRole('button', { name: 'Move website link 1 earlier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move website link 3 later' })).toBeDisabled();
  });

  it('shows the field error under its URL input', async () => {
    const { user } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'fail' }));

    expect(screen.getByRole('textbox', { name: 'Website link 1 URL' })).toHaveAccessibleDescription(
      'Must be an http(s) URL'
    );
  });

  // ADR-0020: the icon follows the href as it is typed; nothing is stored.
  it('shows the platform icon live on a social row', async () => {
    const { user } = renderEditor({
      target: { name: 'socialLinks', section: 'social' },
      defaults: { socialLinks: [{ label: '', url: '' }] },
    });
    const row = screen.getByRole('listitem');
    expect(row.querySelector('[data-icon]')).toHaveAttribute('data-icon', 'globe');

    await user.type(
      screen.getByRole('textbox', { name: 'Website link 1 URL' }),
      'https://www.instagram.com/x'
    );

    expect(row.querySelector('[data-icon]')).toHaveAttribute('data-icon', 'instagram');
  });

  it('shows no icon on a website row', () => {
    renderEditor();

    expect(
      screen.getByRole('list', { name: 'Website links' }).querySelector('[data-icon]')
    ).toBeNull();
  });

  it('is pristine until the admin changes something', async () => {
    const { user, read } = renderEditor();

    const [, pristine] = await read();
    expect(pristine).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Remove website link 1' }));
    const [, dirty] = await read();
    expect(dirty).toBe(true);
  });

  // Only a Contact & Misc row has a description (ADR-0020 amendment).
  describe('description', () => {
    it('shows no description field on a website row', () => {
      renderEditor();

      expect(
        screen.getAllByRole('textbox', { name: /^Website link \d (label|URL)$/ })
      ).toHaveLength(6);
      expect(screen.queryByRole('textbox', { name: /description$/i })).not.toBeInTheDocument();
    });

    it('shows no description field on a social row', () => {
      renderEditor({
        target: { name: 'socialLinks', section: 'social' },
        defaults: { socialLinks: [{ label: 'IG', url: 'https://www.instagram.com/x' }] },
      });

      expect(screen.getByRole('textbox', { name: 'Website link 1 URL' })).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: /description$/i })).not.toBeInTheDocument();
    });

    it('shows a description field on a contact row', () => {
      renderContactEditor([
        { label: 'Agent', description: 'Books US tours', url: 'mailto:a@example.com' },
      ]);

      const description = screen.getByRole('textbox', { name: 'Group 1 link 1 description' });
      expect(description).toHaveValue('Books US tours');
      expect(description).toHaveAttribute('placeholder', 'Description (optional)');
    });

    it('tabs from the label to the URL, then the description, then the row buttons', async () => {
      const { user } = renderContactEditor([
        { label: 'Agent', description: 'Books US tours', url: 'mailto:a@example.com' },
        { label: 'Office', description: '', url: 'tel:+18605550134' },
      ]);
      screen.getByRole('textbox', { name: 'Group 1 link 1 label' }).focus();

      await user.tab();
      expect(screen.getByRole('textbox', { name: 'Group 1 link 1 URL' })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('textbox', { name: 'Group 1 link 1 description' })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Move group 1 link 1 later' })).toHaveFocus();
    });

    it('shows the schema’s error under the description input', async () => {
      const { user } = renderContactEditor([
        {
          label: 'Agent',
          description: 'd'.repeat(MAX_ARTIST_LINK_DESCRIPTION_LENGTH + 1),
          url: 'mailto:a@example.com',
        },
      ]);

      await user.click(screen.getByRole('button', { name: 'validate' }));

      expect(
        await screen.findByRole('textbox', {
          name: 'Group 1 link 1 description',
          description: 'Description is too long',
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: 'Group 1 link 1 URL' })
      ).not.toHaveAccessibleDescription();
    });

    it('appends a contact row with an empty description', async () => {
      const { user, read } = renderContactEditor([]);

      await user.click(screen.getByRole('button', { name: 'Add website link' }));

      expect(screen.getByRole('textbox', { name: 'Group 1 link 1 description' })).toHaveValue('');
      const [values] = await read();
      expect(values).toEqual([{ label: '', description: '', url: '' }]);
    });
  });
});
