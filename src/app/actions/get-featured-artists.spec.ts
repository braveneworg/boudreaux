// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';

import { getFeaturedArtistsAction } from './get-featured-artists';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/featured-artists-service', () => ({
  FeaturedArtistsService: {
    getFeaturedArtists: vi.fn(),
  },
}));

describe('getFeaturedArtistsAction', () => {
  const mockFeaturedArtists = [
    {
      id: 'featured-1',
      displayName: 'Test Artist 1',
      featuredOn: new Date('2024-01-15'),
      position: 1,
      description: 'A test artist description',
      coverArt: 'https://example.com/cover1.jpg',
      artists: [],
      track: null,
      release: null,
      group: null,
    },
    {
      id: 'featured-2',
      displayName: 'Test Artist 2',
      featuredOn: new Date('2024-01-14'),
      position: 2,
      description: null,
      coverArt: 'https://example.com/cover2.jpg',
      artists: [],
      track: null,
      release: null,
      group: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return featured artists with default limit', async () => {
    vi.mocked(FeaturedArtistsService.getFeaturedArtists).mockResolvedValue({
      success: true,
      data: mockFeaturedArtists as never,
    });

    const result = await getFeaturedArtistsAction();

    expect(result).toEqual(mockFeaturedArtists);
    expect(FeaturedArtistsService.getFeaturedArtists).toHaveBeenCalledWith(expect.any(Date), 7);
  });

  it('should return featured artists with custom limit', async () => {
    vi.mocked(FeaturedArtistsService.getFeaturedArtists).mockResolvedValue({
      success: true,
      data: mockFeaturedArtists as never,
    });

    const result = await getFeaturedArtistsAction(5);

    expect(result).toEqual(mockFeaturedArtists);
    expect(FeaturedArtistsService.getFeaturedArtists).toHaveBeenCalledWith(expect.any(Date), 5);
  });

  it('should return empty array on error', async () => {
    vi.mocked(FeaturedArtistsService.getFeaturedArtists).mockResolvedValue({
      success: false,
      error: 'Database unavailable',
    });

    const result = await getFeaturedArtistsAction();

    expect(result).toEqual([]);
  });
});
