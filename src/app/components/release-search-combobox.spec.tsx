/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PublishedReleaseListing } from '@/lib/types/media-models';

import { ReleaseSearchCombobox } from './release-search-combobox';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/releases',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="search-thumbnail" data-src={src} data-alt={alt} />
  ),
}));

describe('ReleaseSearchCombobox', () => {
  const mockReleases = [
    {
      id: 'release-1',
      title: 'Midnight Serenade',
      coverArt: 'https://example.com/cover1.jpg',
      images: [],
      artistReleases: [
        {
          id: 'ar-1',
          artistId: 'artist-1',
          releaseId: 'release-1',
          artist: {
            id: 'artist-1',
            firstName: 'John',
            surname: 'Doe',
            displayName: null,
            groups: [
              {
                id: 'ag-1',
                artistId: 'artist-1',
                groupId: 'group-1',
                group: { id: 'group-1', displayName: 'Jazz Quartet' },
              },
            ],
          },
        },
      ],
      releaseUrls: [],
    },
    {
      id: 'release-2',
      title: 'Morning Glory',
      coverArt: 'https://example.com/cover2.jpg',
      images: [],
      artistReleases: [
        {
          id: 'ar-2',
          artistId: 'artist-2',
          releaseId: 'release-2',
          artist: {
            id: 'artist-2',
            firstName: 'Jane',
            surname: 'Smith',
            displayName: 'J. Smith',
            groups: [],
          },
        },
      ],
      releaseUrls: [],
    },
  ] as unknown as PublishedReleaseListing[];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render search trigger button', () => {
    render(<ReleaseSearchCombobox releases={mockReleases} />);

    expect(screen.getByLabelText('Search releases')).toBeInTheDocument();
  });

  it('should display "No releases found" when search matches nothing', async () => {
    const user = userEvent.setup();
    render(<ReleaseSearchCombobox releases={mockReleases} />);

    // Click the trigger to open the popover
    const trigger = screen.getByLabelText('Search releases');
    await user.click(trigger);

    // Type into the CommandInput that appears inside the popover
    const searchInput = screen.getByPlaceholderText(/search by artist/i);
    await user.type(searchInput, 'zzzznonexistent');

    expect(screen.getByText(/no releases found/i)).toBeInTheDocument();
  });

  it('should have aria-label on the trigger button', () => {
    render(<ReleaseSearchCombobox releases={mockReleases} />);

    const button = screen.getByLabelText('Search releases');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('should handle empty releases array', () => {
    render(<ReleaseSearchCombobox releases={[]} />);

    expect(screen.getByLabelText('Search releases')).toBeInTheDocument();
  });
});
