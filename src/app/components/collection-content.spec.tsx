/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen } from '@testing-library/react';

import { CollectionContent } from './collection-content';

const useCollectionQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/use-collection-query', () => ({
  useCollectionQuery: () => useCollectionQueryMock(),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => createElement('img', props),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('./ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: ({ items }: { items: Array<{ anchorText: string }> }) => (
    <nav data-testid="breadcrumb">{items[0]?.anchorText}</nav>
  ),
}));

vi.mock('./collection-list', () => ({
  CollectionList: ({
    purchases,
    isAdmin,
  }: {
    purchases: Array<{ id: string; purchasedAt: Date }>;
    isAdmin: boolean;
  }) => (
    <div
      data-testid="collection-list"
      data-count={purchases.length}
      data-admin={String(isAdmin)}
      data-first-date={purchases[0]?.purchasedAt instanceof Date ? 'date' : 'not-date'}
    />
  ),
}));

const buildPurchase = (overrides: Record<string, unknown> = {}) => ({
  id: 'purchase-1',
  amountPaid: 1000,
  currency: 'usd',
  purchasedAt: '2026-01-15T00:00:00.000Z',
  release: { id: 'rel-1', title: 'Test Album' },
  ...overrides,
});

describe('CollectionContent', () => {
  it('renders a loading spinner while the query is pending', () => {
    useCollectionQueryMock.mockReturnValue({ isPending: true, error: null, data: undefined });

    const { container } = render(<CollectionContent />);

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByTestId('breadcrumb')).not.toBeInTheDocument();
  });

  it('renders an error state when the query fails with no data', () => {
    useCollectionQueryMock.mockReturnValue({
      isPending: false,
      error: new Error('boom'),
      data: undefined,
    });

    render(<CollectionContent />);

    expect(screen.getByText('Failed to load collection')).toBeInTheDocument();
    expect(screen.getByText('Please try again later.')).toBeInTheDocument();
  });

  it('renders the collection heading image when data is present', () => {
    useCollectionQueryMock.mockReturnValue({
      isPending: false,
      error: null,
      data: { purchases: [], isAdmin: false },
    });

    render(<CollectionContent />);

    const headingImage = screen.getByRole('img', { name: /my collection/i });
    expect(headingImage).toHaveAttribute('alt', 'my collection');
    expect(headingImage).toHaveAttribute('src', '/media/headings/MY-COLLECTION.webp');
  });

  it('wraps the collection content in a green zine panel with the heading inside', () => {
    useCollectionQueryMock.mockReturnValue({
      isPending: false,
      error: null,
      data: { purchases: [], isAdmin: false },
    });

    const { container } = render(<CollectionContent />);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toHaveClass('zine-accent-green');
    expect(panel).toContainElement(screen.getByRole('img', { name: /my collection/i }));
    expect(panel).toContainElement(screen.getByTestId('breadcrumb'));
  });

  it('renders the breadcrumb with the collection label', () => {
    useCollectionQueryMock.mockReturnValue({
      isPending: false,
      error: null,
      data: { purchases: [], isAdmin: false },
    });

    render(<CollectionContent />);

    expect(screen.getByTestId('breadcrumb')).toHaveTextContent('My Collection');
  });

  it('shows the empty state with a link to releases when there are no purchases', () => {
    useCollectionQueryMock.mockReturnValue({
      isPending: false,
      error: null,
      data: { purchases: [], isAdmin: false },
    });

    render(<CollectionContent />);

    expect(screen.getByText('No purchases yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'releases' })).toHaveAttribute('href', '/releases');
    expect(screen.queryByTestId('collection-list')).not.toBeInTheDocument();
  });

  it('renders the collection list with mapped purchases when purchases exist', () => {
    useCollectionQueryMock.mockReturnValue({
      isPending: false,
      error: null,
      data: { purchases: [buildPurchase()], isAdmin: true },
    });

    render(<CollectionContent />);

    const list = screen.getByTestId('collection-list');
    expect(list).toHaveAttribute('data-count', '1');
    expect(list).toHaveAttribute('data-admin', 'true');
    expect(list).toHaveAttribute('data-first-date', 'date');
    expect(screen.queryByText('No purchases yet.')).not.toBeInTheDocument();
  });

  it('falls back to an empty list and non-admin when data omits those fields', () => {
    useCollectionQueryMock.mockReturnValue({
      isPending: false,
      error: null,
      data: {},
    });

    render(<CollectionContent />);

    expect(screen.getByText('No purchases yet.')).toBeInTheDocument();
  });

  it('renders the collection when an error is accompanied by cached data', () => {
    useCollectionQueryMock.mockReturnValue({
      isPending: false,
      error: new Error('stale'),
      data: { purchases: [buildPurchase()], isAdmin: false },
    });

    render(<CollectionContent />);

    expect(screen.queryByText('Failed to load collection')).not.toBeInTheDocument();
    expect(screen.getByTestId('collection-list')).toHaveAttribute('data-admin', 'false');
  });
});
