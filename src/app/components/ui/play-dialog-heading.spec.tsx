/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ComponentProps, ReactElement } from 'react';

import { render, screen } from '@testing-library/react';

import { Dialog, DialogContent } from './dialog';
import { PlayDialogHeading } from './play-dialog-heading';

type HeadingProps = ComponentProps<typeof PlayDialogHeading>;

const baseProps: HeadingProps = {
  title: 'Broken Bone Ballads',
  artistName: 'Ceschi',
  headingOrder: 'title-first',
  centered: false,
  compactOnPhone: false,
};

/** The heading needs a dialog around it: Radix wires its title and description to one. */
const renderHeading = (overrides: Partial<HeadingProps> = {}): ReactElement => {
  const element = (
    <Dialog open>
      <DialogContent>
        <PlayDialogHeading {...baseProps} {...overrides} />
      </DialogContent>
    </Dialog>
  );
  render(element);
  return element;
};

describe('PlayDialogHeading', () => {
  it('names the dialog by the title and describes it by the artist by default', () => {
    renderHeading();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Broken Bone Ballads');
    expect(dialog).toHaveAccessibleDescription('Ceschi');
  });

  it('leads with the artist when artist-first', () => {
    renderHeading({ headingOrder: 'artist-first' });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Ceschi');
    expect(dialog).toHaveAccessibleDescription('Broken Bone Ballads');
  });

  it('leads with the title when artist-first has no artist to name', () => {
    renderHeading({ headingOrder: 'artist-first', artistName: null });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Broken Bone Ballads');
    expect(dialog).toHaveAccessibleDescription('Release audio player');
  });

  it('sets the first line in the cutout face and the second in zinc Jost', () => {
    renderHeading({ headingOrder: 'artist-first' });

    expect(screen.getByRole('heading', { name: 'Ceschi' })).toHaveClass(
      'font-fake-four-cutout',
      'text-zinc-950'
    );
    const description = screen.getByText('Broken Bone Ballads');
    expect(description).toHaveClass('text-zinc-600');
    expect(description).not.toHaveClass('font-fake-four-cutout');
  });

  it('adds the year to the title line when given', () => {
    renderHeading({ headingOrder: 'artist-first', year: 2024 });

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Broken Bone Ballads (2024)');
  });

  it('links the artist line to the artist page when given an href', () => {
    renderHeading({ headingOrder: 'artist-first', artistHref: '/artists/ceschi' });

    const link = screen.getByRole('link', { name: 'Ceschi' });
    expect(link).toHaveAttribute('href', '/artists/ceschi');
    expect(screen.getByRole('heading', { name: 'Ceschi' })).toContainElement(link);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Ceschi');
  });

  it('underlines the artist link on hover only', () => {
    renderHeading({ headingOrder: 'artist-first', artistHref: '/artists/ceschi' });

    const link = screen.getByRole('link', { name: 'Ceschi' });
    expect(link).toHaveClass('no-underline', 'hover:underline');
  });

  it('links the artist line in the description when the title leads', () => {
    renderHeading({ artistHref: '/artists/ceschi' });

    expect(screen.getByRole('link', { name: 'Ceschi' })).toHaveAttribute('href', '/artists/ceschi');
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Ceschi');
  });

  it('links nothing without an href', () => {
    renderHeading({ headingOrder: 'artist-first' });

    expect(screen.queryByRole('link')).toBeNull();
  });

  it('centers both lines when asked', () => {
    renderHeading({ headingOrder: 'artist-first', centered: true });

    expect(screen.getByText('Ceschi')).toHaveClass('text-center');
    expect(screen.getByText('Broken Bone Ballads')).toHaveClass('text-center');
  });

  it('sets both lines smaller on a phone when compact', () => {
    renderHeading({ headingOrder: 'artist-first', compactOnPhone: true });

    expect(screen.getByText('Ceschi')).toHaveClass('max-sm:text-lg', 'max-sm:leading-tight');
    expect(screen.getByText('Broken Bone Ballads')).toHaveClass('max-sm:text-xs');
  });

  it('renders an action at the right of the heading, after both lines', () => {
    renderHeading({ action: <button type="button">More</button> });

    const action = screen.getByRole('button', { name: 'More' });
    const description = screen.getByText('Ceschi');
    expect(
      description.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(action.parentElement).toHaveClass('shrink-0');
  });

  it('keeps the header to its two lines without an action', () => {
    renderHeading();

    const header = document.querySelector('[data-slot="dialog-header"]');
    expect(header?.children).toHaveLength(2);
    expect(header).toHaveClass('pr-8');
  });
});
