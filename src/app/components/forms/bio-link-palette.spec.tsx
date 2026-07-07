/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactNode } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BIO_LINK_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusLink } from '@/lib/validation/bio-generation-schema';

import { BioLinkPalette } from './bio-link-palette';

vi.mock('@/lib/utils/api-base-url', () => ({
  getApiBaseUrl: () => 'https://fakefourrecords.com',
}));

const mockIsMobile = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile(),
}));

vi.mock('./link-preview-card', () => ({
  LinkPreviewCard: ({ url, enabled }: { url: string; enabled: boolean }) => (
    <div data-testid="link-preview-card" data-url={url} data-enabled={String(enabled)} />
  ),
}));

vi.mock('./custom-link-editor', () => ({
  CustomLinkEditor: ({ artistId }: { artistId: string }) => (
    <div data-testid="custom-link-editor" data-artist-id={artistId} />
  ),
}));

vi.mock('@/app/components/ui/hover-card', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-hover-card">{children}</div>
  ),
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/app/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-popover">{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const LINKS: BioStatusLink[] = [
  { id: 'l1', label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/X', kind: 'wikipedia' },
  { id: 'l2', label: 'Sad, Fat Luck', url: '/releases/r1', kind: 'release' },
];

const FILTER_LINKS: BioStatusLink[] = [
  { id: 'l1', label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Ceschi', kind: 'wikipedia' },
  {
    id: 'l2',
    label: 'Ceschi on Bandcamp',
    url: 'https://ceschi.bandcamp.com',
    kind: 'streaming',
  },
];

describe('BioLinkPalette', () => {
  beforeEach(() => mockIsMobile.mockReturnValue(false));

  it('renders the custom link editor wired to the artist id', () => {
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByTestId('custom-link-editor')).toHaveAttribute('data-artist-id', 'a1');
  });

  it('renders one tile per link with its kind badge', () => {
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByText('Wikipedia')).toBeInTheDocument();
    expect(screen.getByText('Sad, Fat Luck')).toBeInTheDocument();
    expect(screen.getByText('wikipedia')).toBeInTheDocument();
    expect(screen.getByText('release')).toBeInTheDocument();
  });

  it('renders square draggable tiles with no rounded corners', () => {
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    const tile = screen.getByText('Wikipedia').closest('li') as HTMLElement;
    expect(tile.className).not.toMatch(/rounded/);
  });

  it('shows the external icon only for external links', () => {
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    const internalTile = screen.getByText('Sad, Fat Luck').closest('li');
    expect(internalTile?.querySelector('[data-external-icon]')).toBeNull();
  });

  it('shows the external icon for external links', () => {
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    const externalTile = screen.getByText('Wikipedia').closest('li');
    expect(externalTile?.querySelector('[data-external-icon]')).not.toBeNull();
  });

  it('calls onDelete with the row id when X is pressed', async () => {
    const onDelete = vi.fn();
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={onDelete} onInsert={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete link Wikipedia' }));
    expect(onDelete).toHaveBeenCalledWith('l1');
  });

  it('sets the link drag payload on dragstart', () => {
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
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
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
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
    render(
      <BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} disabled />
    );
    expect(screen.getByRole('button', { name: 'Delete link Wikipedia' })).toBeDisabled();
  });

  it('renders the count, filters by text, and inserts on click', async () => {
    const onInsert = vi.fn();
    render(
      <BioLinkPalette artistId="a1" links={FILTER_LINKS} onDelete={vi.fn()} onInsert={onInsert} />
    );
    expect(screen.getByText(/Discovered links \(2\)/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Filter links'), 'bandcamp');
    expect(screen.queryByText('Wikipedia')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Insert link Ceschi on Bandcamp' }));
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ label: 'Ceschi on Bandcamp' }));
  });

  it('disables the insert button when disabled prop is true', () => {
    render(
      <BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} disabled />
    );
    expect(screen.getByRole('button', { name: 'Insert link Wikipedia' })).toBeDisabled();
  });

  it('renders a preview eye trigger for an external link', () => {
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Preview link Wikipedia' })).toBeInTheDocument();
  });

  it('renders no preview eye trigger for an internal link', () => {
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(
      screen.queryByRole('button', { name: 'Preview link Sad, Fat Luck' })
    ).not.toBeInTheDocument();
  });

  it('previews external links inside a hover card on desktop', () => {
    mockIsMobile.mockReturnValue(false);
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByTestId('mock-hover-card')).toBeInTheDocument();
  });

  it('does not use a popover on desktop', () => {
    mockIsMobile.mockReturnValue(false);
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.queryByTestId('mock-popover')).not.toBeInTheDocument();
  });

  it('previews external links inside a popover on mobile', () => {
    mockIsMobile.mockReturnValue(true);
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByTestId('mock-popover')).toBeInTheDocument();
  });

  it('does not use a hover card on mobile', () => {
    mockIsMobile.mockReturnValue(true);
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.queryByTestId('mock-hover-card')).not.toBeInTheDocument();
  });

  it('passes the external link url to the preview card', () => {
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByTestId('link-preview-card')).toHaveAttribute(
      'data-url',
      'https://en.wikipedia.org/wiki/X'
    );
  });

  it('keeps the preview query idle until the card is opened', () => {
    render(<BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByTestId('link-preview-card')).toHaveAttribute('data-enabled', 'false');
  });

  it('disables the preview eye trigger when disabled prop is true', () => {
    render(
      <BioLinkPalette artistId="a1" links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} disabled />
    );
    expect(screen.getByRole('button', { name: 'Preview link Wikipedia' })).toBeDisabled();
  });
});
