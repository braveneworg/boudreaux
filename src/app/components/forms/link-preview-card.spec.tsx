/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';

import type { LinkPreview } from '@/lib/validation/link-preview-schema';

import { LinkPreviewCard } from './link-preview-card';

const mockUseLinkPreviewQuery = vi.hoisted(() => vi.fn());

vi.mock('@/app/hooks/use-link-preview-query', () => ({
  useLinkPreviewQuery: (url: string, options: { enabled: boolean }) =>
    mockUseLinkPreviewQuery(url, options),
}));

const RESOLVED: LinkPreview = {
  url: 'https://example.com/page',
  resolved: true,
  title: 'A Great Page',
  description: 'The most descriptive description.',
  siteName: 'Example',
  imageDataUri: 'data:image/webp;base64,SGVybw==',
  faviconDataUri: 'data:image/png;base64,RmF2',
};

describe('LinkPreviewCard', () => {
  afterEach(() => mockUseLinkPreviewQuery.mockReset());

  it('shows a loading skeleton while the query is pending', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByRole('status', { name: 'Loading link preview' })).toBeInTheDocument();
  });

  it('forwards the enabled flag to the query hook', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: RESOLVED, isPending: false, isError: false });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(mockUseLinkPreviewQuery).toHaveBeenCalledWith('https://example.com/page', {
      enabled: true,
    });
  });

  it('renders the hero thumbnail from the data URI', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: RESOLVED, isPending: false, isError: false });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByRole('img', { name: 'A Great Page' })).toHaveAttribute(
      'src',
      'data:image/webp;base64,SGVybw=='
    );
  });

  it('renders the title as a heading', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: RESOLVED, isPending: false, isError: false });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByRole('heading', { name: 'A Great Page' })).toBeInTheDocument();
  });

  it('renders the description', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: RESOLVED, isPending: false, isError: false });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByText('The most descriptive description.')).toBeInTheDocument();
  });

  it('renders the site name', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: RESOLVED, isPending: false, isError: false });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByText('Example')).toBeInTheDocument();
  });

  it('falls back to the bare host when the preview is unresolved', () => {
    mockUseLinkPreviewQuery.mockReturnValue({
      data: { ...RESOLVED, resolved: false },
      isPending: false,
      isError: false,
    });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('shows the no-preview message when the query errors', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByText(/No preview available/)).toBeInTheDocument();
  });

  it('omits any image when a resolved preview has no thumbnail or favicon', () => {
    mockUseLinkPreviewQuery.mockReturnValue({
      data: { ...RESOLVED, imageDataUri: null, faviconDataUri: null },
      isPending: false,
      isError: false,
    });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
