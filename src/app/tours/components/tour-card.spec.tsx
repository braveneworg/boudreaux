/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { TourCard } from './tour-card';

import type { Artist, Tour, TourDate, TourDateHeadliner, TourImage, Venue } from '@prisma/client';

type TourWithRelations = Tour & {
  tourDates: Array<
    TourDate & {
      venue: Venue;
      headliners: Array<
        TourDateHeadliner & {
          artist: Artist | null;
        }
      >;
    }
  >;
  images: TourImage[];
};

const createMockArtist = (overrides?: Partial<Artist>): Artist =>
  ({
    id: 'artist-1',
    firstName: 'John',
    surname: 'Doe',
    displayName: 'John Doe',
    ...overrides,
  }) as Artist;

const createMockVenue = (overrides?: Partial<Venue>): Venue =>
  ({
    id: 'venue-1',
    name: 'Test Venue',
    city: 'New York',
    state: 'NY',
    address: null,
    postalCode: null,
    country: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Venue;

const createMockImage = (overrides?: Partial<TourImage>): TourImage =>
  ({
    id: 'image-1',
    tourId: 'tour-1',
    s3Key: 'test-key',
    s3Bucket: 'test-bucket',
    s3Url: 'https://example.com/image.jpg',
    cdnUrl: 'https://cdn.example.com/image.jpg',
    filename: 'image.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024,
    width: 800,
    height: 600,
    displayOrder: 0,
    altText: 'Test image',
    caption: null,
    uploadedAt: new Date(),
    ...overrides,
  }) as TourImage;

const createMockTourDateHeadliner = (
  overrides?: Partial<
    TourDateHeadliner & {
      artist: Artist | null;
    }
  >
): TourDateHeadliner & {
  artist: Artist | null;
} =>
  ({
    id: 'th-1',
    tourDateId: 'tour-date-1',
    artistId: 'artist-1',
    sortOrder: 0,
    artist: createMockArtist(),
    ...overrides,
  }) as TourDateHeadliner & {
    artist: Artist | null;
  };

const createMockTourDate = (
  overrides?: Partial<
    TourDate & {
      venue: Venue;
      headliners: Array<
        TourDateHeadliner & {
          artist: Artist | null;
        }
      >;
    }
  >
): TourDate & {
  venue: Venue;
  headliners: Array<
    TourDateHeadliner & {
      artist: Artist | null;
    }
  >;
} =>
  ({
    id: 'tour-date-1',
    tourId: 'tour-1',
    startDate: new Date(Date.UTC(2026, 5, 1)),
    endDate: null,
    showStartTime: new Date(Date.UTC(2026, 5, 1, 20, 0)),
    showEndTime: null,
    venueId: 'venue-1',
    ticketsUrl: 'https://example.com',
    ticketIconUrl: null,
    ticketPrices: '$25',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    venue: createMockVenue(),
    headliners: [],
    ...overrides,
  }) as TourDate & {
    venue: Venue;
    headliners: Array<
      TourDateHeadliner & {
        artist: Artist | null;
      }
    >;
  };

const createMockTour = (overrides?: Partial<TourWithRelations>): TourWithRelations =>
  ({
    id: 'tour-1',
    title: 'Test Tour',
    subtitle: 'A test tour',
    subtitle2: null,
    description: 'Test description',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    tourDates: [createMockTourDate()],
    images: [],
    ...overrides,
  }) as TourWithRelations;

describe('TourCard', () => {
  it('renders tour card with test id', () => {
    const tour = createMockTour();
    render(<TourCard tour={tour} />);

    expect(screen.getByTestId('tour-card')).toBeInTheDocument();
  });

  it('renders tour title', () => {
    const tour = createMockTour({ title: 'Rock Concert 2026' });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('Rock Concert 2026')).toBeInTheDocument();
  });

  it('renders tour subtitle when present', () => {
    const tour = createMockTour({ subtitle: 'Summer Edition' });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('Summer Edition')).toBeInTheDocument();
  });

  it('does not render subtitle when absent', () => {
    const tour = createMockTour({ subtitle: null });
    render(<TourCard tour={tour} />);

    expect(screen.queryByText('Summer Edition')).not.toBeInTheDocument();
  });

  it('renders venue name and location', () => {
    const venue = createMockVenue({ name: 'Madison Square Garden', city: 'New York', state: 'NY' });
    const tour = createMockTour({
      tourDates: [createMockTourDate({ venue })],
    });
    render(<TourCard tour={tour} />);

    const matches = screen.getAllByText(/Madison Square Garden/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders single venue as a directions link', () => {
    const venue = createMockVenue({
      name: 'Ryman Auditorium',
      address: '116 5th Ave N',
      city: 'Nashville',
      state: 'TN',
      postalCode: '37219',
      country: 'US',
    });
    const tour = createMockTour({
      tourDates: [createMockTourDate({ venue })],
    });
    render(<TourCard tour={tour} />);

    const link = screen.getByText('Ryman Auditorium').closest('a');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link?.getAttribute('href')).toContain('Ryman%20Auditorium');
  });

  it('renders multiple venues as static text without a directions link', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          id: 'td-1',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          venue: createMockVenue({ id: 'venue-1', name: 'Madison Square Garden' }),
        }),
        createMockTourDate({
          id: 'td-2',
          startDate: new Date('2026-06-02T00:00:00.000Z'),
          venue: createMockVenue({ id: 'venue-2', name: 'Ryman Auditorium' }),
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    const venueText = screen.getByText('2 venues');
    expect(venueText).toBeInTheDocument();
    expect(venueText.closest('a')).toBeNull();
  });

  it('renders headliner names', () => {
    const artist = createMockArtist({ displayName: 'The Beatles' });
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [createMockTourDateHeadliner({ artist })],
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('renders multiple headliners with comma separation', () => {
    const artist1 = createMockArtist({ id: 'artist-1', displayName: 'The Beatles' });
    const artist2 = createMockArtist({ id: 'artist-2', displayName: 'Rolling Stones' });
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [
            createMockTourDateHeadliner({ id: 'th-1', artistId: 'artist-1', artist: artist1 }),
            createMockTourDateHeadliner({ id: 'th-2', artistId: 'artist-2', artist: artist2 }),
          ],
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('The Beatles, Rolling Stones')).toBeInTheDocument();
  });

  it('uses artist first and last name when no display name', () => {
    const artist = createMockArtist({
      displayName: null,
      firstName: 'John',
      surname: 'Lennon',
    });
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [createMockTourDateHeadliner({ artist })],
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('John Lennon')).toBeInTheDocument();
  });

  it('renders primary image when available', () => {
    const image = createMockImage({
      s3Url: 'https://example.com/tour-image.jpg',
      altText: 'Tour promotional image',
    });
    const tour = createMockTour({ images: [image] });
    render(<TourCard tour={tour} />);

    const img = screen.getByAltText('Tour promotional image');
    expect(img).toBeInTheDocument();
  });

  it('uses tour title as alt text when image has no alt text', () => {
    const image = createMockImage({ altText: null });
    const tour = createMockTour({ title: 'Rock Concert', images: [image] });
    render(<TourCard tour={tour} />);

    const img = screen.getByAltText('Rock Concert');
    expect(img).toBeInTheDocument();
  });

  it('renders single date when no end date', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          startDate: new Date(Date.UTC(2026, 5, 1)),
          endDate: null,
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    // Check that a date is rendered (exact format may vary by timezone)
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('renders date range when end date differs from start date', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({ id: 'tour-date-1', startDate: new Date(Date.UTC(2026, 5, 1)) }),
        createMockTourDate({ id: 'tour-date-2', startDate: new Date(Date.UTC(2026, 5, 3)) }),
      ],
    });
    render(<TourCard tour={tour} />);

    // Should show a date range with a dash
    expect(screen.getByText(/-/)).toBeInTheDocument();
  });

  it('renders ticket price when available', () => {
    const tour = createMockTour({
      tourDates: [createMockTourDate({ ticketPrices: '$25 - $50' })],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('$25 - $50')).toBeInTheDocument();
  });

  it('renders View Details button', () => {
    const tour = createMockTour();
    render(<TourCard tour={tour} />);

    expect(screen.getByText('View Details')).toBeInTheDocument();
  });

  it('renders Get Tickets button when tickets URL is available', () => {
    const tour = createMockTour({
      tourDates: [createMockTourDate({ ticketsUrl: 'https://tickets.example.com' })],
    });
    render(<TourCard tour={tour} />);

    const button = screen.getByText('Get Tickets');
    expect(button).toBeInTheDocument();
    expect(button.closest('a')).toHaveAttribute('href', 'https://tickets.example.com');
    expect(button.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('does not render Get Tickets button when no tickets URL', () => {
    const tour = createMockTour({
      tourDates: [createMockTourDate({ ticketsUrl: null })],
    });
    render(<TourCard tour={tour} />);

    expect(screen.queryByText('Get Tickets')).not.toBeInTheDocument();
  });

  it('links to tour detail page', () => {
    const tour = createMockTour({ id: 'tour-123' });
    render(<TourCard tour={tour} />);

    const links = screen.getAllByRole('link', { name: /Test Tour|View Details/i });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      expect(link).toHaveAttribute('href', '/tours/tour-123');
    });
  });

  it('renders "Unknown Artist" when headliner has no artist', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [
            createMockTourDateHeadliner({
              artist: null,
              artistId: null,
            }),
          ],
        }),
      ],
    });

    render(<TourCard tour={tour} />);
    expect(screen.getByText('Unknown Artist')).toBeInTheDocument();
  });

  it('places headliner with setTime before one without setTime', () => {
    const withTime = createMockArtist({ id: 'artist-a', displayName: 'Night Closer' });
    const withoutTime = createMockArtist({ id: 'artist-b', displayName: 'Opener Act' });

    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [
            createMockTourDateHeadliner({
              id: 'th-1',
              artist: withoutTime,
              artistId: withoutTime.id,
              sortOrder: 1,
              setTime: null,
            } as never),
            createMockTourDateHeadliner({
              id: 'th-2',
              artist: withTime,
              artistId: withTime.id,
              sortOrder: 0,
              setTime: new Date('1970-01-01T21:00:00.000Z'),
            } as never),
          ],
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    // Artist with setTime should appear first regardless of sortOrder
    expect(screen.getByText('Night Closer, Opener Act')).toBeInTheDocument();
  });

  // ─── Timezone-aware display ───────────────────────────────────────────────────

  it('formats date in venue timezone when timeZone crosses a midnight boundary', () => {
    // 2026-01-16T05:00:00Z is Jan 15 23:00 CST (America/Chicago, UTC-6 in winter)
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          startDate: new Date('2026-01-16T05:00:00.000Z'),
          timeZone: 'America/Chicago',
        } as never),
      ],
    });
    render(<TourCard tour={tour} />);

    // Should display Jan 15 (Chicago local), not Jan 16 (UTC)
    expect(screen.getByText(/Jan 15/)).toBeInTheDocument();
  });

  it('formats show time in venue timezone when timeZone is set', () => {
    // 2026-06-01T23:00:00Z is 6:00 PM CDT in America/Chicago (UTC-5 in summer)
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          showStartTime: new Date('2026-06-01T23:00:00.000Z'),
          timeZone: 'America/Chicago',
        } as never),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText(/6:00 PM/)).toBeInTheDocument();
  });

  it("renders a date range using each date's own timezone", () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          id: 'td-1',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          timeZone: 'America/New_York',
        } as never),
        createMockTourDate({
          id: 'td-2',
          startDate: new Date('2026-07-01T00:00:00.000Z'),
          timeZone: 'America/Los_Angeles',
        } as never),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText(/-/)).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('falls back gracefully when timeZone is null', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          startDate: new Date(Date.UTC(2026, 5, 15)),
          showStartTime: new Date(Date.UTC(2026, 5, 15, 20, 0)),
          timeZone: null,
        } as never),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByTestId('tour-card')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  // ─── Headliner sort order ─────────────────────────────────────────────────────

  it('displays headliners in descending sortOrder (headliner before opener)', () => {
    const opener = createMockArtist({ id: 'artist-open', displayName: 'The Opener' });
    const headliner = createMockArtist({ id: 'artist-head', displayName: 'The Headliner' });
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [
            createMockTourDateHeadliner({
              id: 'th-1',
              artist: opener,
              artistId: opener.id,
              sortOrder: 0,
            }),
            createMockTourDateHeadliner({
              id: 'th-2',
              artist: headliner,
              artistId: headliner.id,
              sortOrder: 1,
            }),
          ],
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    // Headliner (sortOrder 1, plays later) should appear before opener (sortOrder 0)
    expect(screen.getByText('The Headliner, The Opener')).toBeInTheDocument();
  });

  it('sorts headliners by setTime descending when setTime is available', () => {
    const early = createMockArtist({ id: 'artist-early', displayName: 'Early Act' });
    const late = createMockArtist({ id: 'artist-late', displayName: 'Late Act' });
    const earlyTime = new Date('1970-01-01T19:00:00.000Z');
    const lateTime = new Date('1970-01-01T21:00:00.000Z');

    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [
            createMockTourDateHeadliner({
              id: 'th-1',
              artist: early,
              artistId: early.id,
              sortOrder: 0,
              setTime: earlyTime,
            } as never),
            createMockTourDateHeadliner({
              id: 'th-2',
              artist: late,
              artistId: late.id,
              sortOrder: 1,
              setTime: lateTime,
            } as never),
          ],
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    // Late act (21:00) should appear before early act (19:00)
    expect(screen.getByText('Late Act, Early Act')).toBeInTheDocument();
  });

  it('prioritises setTime over sortOrder when both are present', () => {
    // Opener has a high sortOrder but an early setTime (a quirky data scenario)
    const artistA = createMockArtist({ id: 'artist-a', displayName: 'Artist A' });
    const artistB = createMockArtist({ id: 'artist-b', displayName: 'Artist B' });

    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [
            createMockTourDateHeadliner({
              id: 'th-1',
              artist: artistA,
              artistId: artistA.id,
              sortOrder: 0,
              setTime: new Date('1970-01-01T22:00:00.000Z'),
            } as never),
            createMockTourDateHeadliner({
              id: 'th-2',
              artist: artistB,
              artistId: artistB.id,
              sortOrder: 1,
              setTime: new Date('1970-01-01T20:00:00.000Z'),
            } as never),
          ],
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    // Artist A has later setTime (22:00) so appears first despite lower sortOrder
    expect(screen.getByText('Artist A, Artist B')).toBeInTheDocument();
  });

  it('places headliner at index 0 with setTime before one at index 1 without setTime', () => {
    const withTime = createMockArtist({ id: 'artist-a', displayName: 'Headliner' });
    const withoutTime = createMockArtist({ id: 'artist-b', displayName: 'Support Act' });

    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [
            // withTime is first in the array so the sort comparator receives it as `a`
            createMockTourDateHeadliner({
              id: 'th-1',
              artist: withTime,
              artistId: withTime.id,
              sortOrder: 0,
              setTime: new Date('1970-01-01T22:00:00.000Z'),
            } as never),
            createMockTourDateHeadliner({
              id: 'th-2',
              artist: withoutTime,
              artistId: withoutTime.id,
              sortOrder: 1,
              setTime: null,
            } as never),
          ],
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('Headliner, Support Act')).toBeInTheDocument();
  });

  it('deduplicates headliners who appear on multiple tour dates', () => {
    const artist = createMockArtist({ id: 'artist-shared', displayName: 'Shared Artist' });

    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          id: 'td-1',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          headliners: [createMockTourDateHeadliner({ id: 'th-1', artist, artistId: artist.id })],
        }),
        createMockTourDate({
          id: 'td-2',
          startDate: new Date('2026-06-02T00:00:00.000Z'),
          headliners: [createMockTourDateHeadliner({ id: 'th-2', artist, artistId: artist.id })],
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    // Should appear only once even though singer is on two tour dates
    const headlinerText = screen.getByText('Shared Artist');
    expect(headlinerText).toBeInTheDocument();
    expect(screen.queryAllByText('Shared Artist')).toHaveLength(1);
  });

  it('renders all headliners when there are 4+ headliners', () => {
    const artists = [1, 2, 3, 4].map((n) =>
      createMockArtist({ id: `artist-${n}`, displayName: `Artist ${n}` })
    );

    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: artists.map((a, i) =>
            createMockTourDateHeadliner({
              id: `th-${i}`,
              artist: a,
              artistId: a.id,
              sortOrder: i,
            })
          ),
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText(/Artist 4.*Artist 3.*Artist 2.*Artist 1/)).toBeInTheDocument();
  });

  it('shows "N shows" when there are multiple tour dates with show times', () => {
    const showTime = new Date('2026-06-01T20:00:00.000Z');
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          id: 'td-1',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          showStartTime: showTime,
        } as never),
        createMockTourDate({
          id: 'td-2',
          startDate: new Date('2026-06-02T00:00:00.000Z'),
          showStartTime: showTime,
        } as never),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('2 shows')).toBeInTheDocument();
  });

  it('renders "No dates announced" when tour has no tour dates', () => {
    const tour = createMockTour({ tourDates: [] });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('No dates announced')).toBeInTheDocument();
  });

  it('renders "X venues" when there are multiple unique venues', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          id: 'td-1',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          venue: createMockVenue({ id: 'venue-1', name: 'Madison Square Garden' }),
        }),
        createMockTourDate({
          id: 'td-2',
          startDate: new Date('2026-06-02T00:00:00.000Z'),
          venue: createMockVenue({ id: 'venue-2', name: 'Ryman Auditorium' }),
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('2 venues')).toBeInTheDocument();
  });

  it('renders show end time when showEndTime is set for a single tour date', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          showStartTime: new Date('2026-06-01T20:00:00.000Z'),
          showEndTime: new Date('2026-06-01T22:00:00.000Z'),
          timeZone: 'UTC',
        } as never),
      ],
    });
    render(<TourCard tour={tour} />);

    // The rendered time string should contain both start and end times
    const timeText = screen.getByText(/8:00 PM.*10:00 PM/);
    expect(timeText).toBeInTheDocument();
  });

  it('falls back to first image when no image has displayOrder 0', () => {
    const image = createMockImage({
      displayOrder: 5,
      altText: 'Fallback image',
    });
    const tour = createMockTour({ images: [image] });
    render(<TourCard tour={tour} />);

    expect(screen.getByAltText('Fallback image')).toBeInTheDocument();
  });

  // ─── New behavior: TBD headliners ──────────────────────────────────────────────

  it('renders "TBD" when tour has no headliners', () => {
    const tour = createMockTour({
      tourDates: [createMockTourDate({ headliners: [] })],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('TBD')).toBeInTheDocument();
  });

  // ─── New behavior: Venue directions link details ──────────────────────────────

  it('renders city and state next to venue directions link', () => {
    const venue = createMockVenue({
      name: 'Ryman Auditorium',
      city: 'Nashville',
      state: 'TN',
    });
    const tour = createMockTour({
      tourDates: [createMockTourDate({ venue })],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('Nashville, TN')).toBeInTheDocument();
  });

  it('renders accessible sr-only directions text for single venue', () => {
    const venue = createMockVenue({
      name: 'Ryman Auditorium',
      city: 'Nashville',
      state: 'TN',
    });
    const tour = createMockTour({
      tourDates: [createMockTourDate({ venue })],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText(/Get directions to Ryman Auditorium/)).toBeInTheDocument();
  });

  // ─── New behavior: Separator ──────────────────────────────────────────────────

  it('renders a separator at the bottom of the card', () => {
    const tour = createMockTour();
    render(<TourCard tour={tour} />);

    expect(screen.getByRole('none')).toBeInTheDocument();
  });
});
