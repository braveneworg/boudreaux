/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { tourWithRelationsSchema } from './tour-models-schema';

const ISO = '2024-05-06T19:30:00.000Z';

/** A full `Artist` scalar record for a headliner. */
const artistScalar = {
  id: 'a1',
  firstName: 'John',
  middleName: null,
  surname: 'Doe',
  akaNames: null,
  displayName: null,
  title: null,
  suffix: null,
  phone: null,
  email: null,
  address1: null,
  address2: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
  bio: null,
  shortBio: null,
  altBio: null,
  bioGeneratedAt: null,
  bioModel: null,
  bioStatus: null,
  bioError: null,
  bioStartedAt: null,
  bioJobToken: null,
  bioProgress: null,
  slug: 'john-doe',
  genres: null,
  bornOn: null,
  diedOn: null,
  formedOn: null,
  publishedOn: null,
  publishedBy: null,
  createdAt: ISO,
  createdBy: null,
  updatedAt: ISO,
  updatedBy: null,
  deletedOn: null,
  deletedBy: null,
  deactivatedAt: null,
  deactivatedBy: null,
  reactivatedAt: null,
  reactivatedBy: null,
  notes: [],
  tags: null,
  isPseudonymous: false,
  isActive: true,
  instruments: null,
  featuredArtistId: null,
};

const venue = {
  id: 'v1',
  name: 'The Hall',
  address: null,
  city: 'Austin',
  state: null,
  postalCode: null,
  country: null,
  capacity: null,
  notes: null,
  timeZone: null,
  createdAt: ISO,
  updatedAt: ISO,
  createdBy: null,
  updatedBy: null,
};

const tourImage = {
  id: 'ti1',
  tourId: 't1',
  s3Key: 'k',
  s3Url: 'https://s3',
  s3Bucket: 'b',
  fileName: 'poster.jpg',
  fileSize: 2048,
  mimeType: 'image/jpeg',
  displayOrder: 0,
  altText: null,
  createdAt: ISO,
  uploadedBy: null,
};

const tourDate = {
  id: 'td1',
  tourId: 't1',
  startDate: ISO,
  endDate: null,
  showStartTime: ISO,
  showEndTime: null,
  doorsOpenAt: null,
  venueId: 'v1',
  timeZone: null,
  utcOffset: null,
  ticketsUrl: null,
  ticketIconUrl: null,
  ticketPrices: null,
  notes: null,
  createdAt: ISO,
  updatedAt: ISO,
  venue,
  headliners: [
    {
      id: 'h1',
      tourDateId: 'td1',
      artistId: 'a1',
      sortOrder: 0,
      setTime: ISO,
      createdAt: ISO,
      artist: artistScalar,
    },
    {
      id: 'h2',
      tourDateId: 'td1',
      artistId: null,
      sortOrder: 1,
      setTime: null,
      createdAt: ISO,
      artist: null,
    },
  ],
};

const tour = {
  id: 't1',
  title: 'Summer Tour',
  subtitle: null,
  subtitle2: null,
  description: null,
  notes: null,
  createdAt: ISO,
  updatedAt: ISO,
  createdBy: null,
  updatedBy: null,
  tourDates: [tourDate],
  images: [tourImage],
};

describe('tourWithRelationsSchema', () => {
  it('parses a tour with dates, venue, headliners (with and without artist), and images', () => {
    expect(() => tourWithRelationsSchema.parse(tour)).not.toThrow();
  });

  it('coerces a tour date start date string into a Date', () => {
    expect(tourWithRelationsSchema.parse(tour).tourDates[0].startDate).toBeInstanceOf(Date);
  });

  it('coerces a headliner set time string into a Date', () => {
    expect(tourWithRelationsSchema.parse(tour).tourDates[0].headliners[0].setTime).toBeInstanceOf(
      Date
    );
  });

  it('keeps a headliner with no artist as null', () => {
    expect(tourWithRelationsSchema.parse(tour).tourDates[0].headliners[1].artist).toBeNull();
  });

  it('rejects a tour missing its title', () => {
    const { title: _omit, ...invalid } = tour;
    expect(() => tourWithRelationsSchema.parse(invalid)).toThrow();
  });

  it('rejects a tour date whose venue is missing a required field', () => {
    const invalid = {
      ...tour,
      tourDates: [{ ...tourDate, venue: { ...venue, city: undefined } }],
    };
    expect(() => tourWithRelationsSchema.parse(invalid)).toThrow();
  });
});
