/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BIO_LINK_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusLink } from '@/lib/validation/bio-generation-schema';

import { BioLinkPalette } from './bio-link-palette';

vi.mock('@/lib/utils/api-base-url', () => ({
  getApiBaseUrl: () => 'https://fakefourrecords.com',
}));

const LINKS: BioStatusLink[] = [
  { id: 'l1', label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/X', kind: 'wikipedia' },
  { id: 'l2', label: 'Sad, Fat Luck', url: '/releases/r1', kind: 'release' },
];

describe('BioLinkPalette', () => {
  it('renders one tile per link with its kind badge', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} />);
    expect(screen.getByText('Wikipedia')).toBeInTheDocument();
    expect(screen.getByText('Sad, Fat Luck')).toBeInTheDocument();
    expect(screen.getByText('wikipedia')).toBeInTheDocument();
    expect(screen.getByText('release')).toBeInTheDocument();
  });

  it('renders square draggable tiles with no rounded corners', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} />);
    const tile = screen.getByText('Wikipedia').closest('li') as HTMLElement;
    expect(tile.className).not.toMatch(/rounded/);
  });

  it('shows the external icon only for external links', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} />);
    const internalTile = screen.getByText('Sad, Fat Luck').closest('li');
    expect(internalTile?.querySelector('[data-external-icon]')).toBeNull();
  });

  it('shows the external icon for external links', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} />);
    const externalTile = screen.getByText('Wikipedia').closest('li');
    expect(externalTile?.querySelector('[data-external-icon]')).not.toBeNull();
  });

  it('calls onDelete with the row id when X is pressed', async () => {
    const onDelete = vi.fn();
    render(<BioLinkPalette links={LINKS} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete link Wikipedia' }));
    expect(onDelete).toHaveBeenCalledWith('l1');
  });

  it('sets the link drag payload on dragstart', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} />);
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByText('Wikipedia').closest('li') as HTMLElement, {
      dataTransfer: { setData, effectAllowed: '' },
    });
    expect(setData).toHaveBeenCalledWith(
      BIO_LINK_DRAG_MIME,
      JSON.stringify({
        label: 'Wikipedia',
        url: 'https://en.wikipedia.org/wiki/X',
        kind: 'wikipedia',
        isExternal: true,
      })
    );
  });

  it('sets isExternal false for an internal link in the drag payload', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} />);
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByText('Sad, Fat Luck').closest('li') as HTMLElement, {
      dataTransfer: { setData, effectAllowed: '' },
    });
    expect(setData).toHaveBeenCalledWith(
      BIO_LINK_DRAG_MIME,
      JSON.stringify({
        label: 'Sad, Fat Luck',
        url: '/releases/r1',
        kind: 'release',
        isExternal: false,
      })
    );
  });

  it('disables the delete button when disabled prop is true', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Delete link Wikipedia' })).toBeDisabled();
  });
});
