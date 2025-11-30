'use server';

import 'server-only';

import { prisma } from '@/app/lib/prisma';

import type { Artist, Release } from '@prisma/client';

export interface FeaturedArtist
  extends Pick<
    Artist,
    | 'id'
    | 'displayName'
    | 'firstName'
    | 'surname'
    | 'shortBio'
    | 'featuredDescription'
    | 'featuredOn'
    | 'featuredUntil'
    | 'slug'
  > {
  featuredTrack?: {
    id: string;
    title: string;
    audioFile: string;
  } | null;
}

export interface FeaturedRelease
  extends Pick<
    Release,
    | 'id'
    | 'title'
    | 'description'
    | 'coverArt'
    | 'releasedOn'
    | 'featuredOn'
    | 'featuredUntil'
    | 'featuredDescription'
  > {
  artists: {
    id: string;
    displayName: string | null;
    firstName: string;
    surname: string;
    slug: string;
  }[];
}

export interface FeaturedContent {
  artists: FeaturedArtist[];
  releases: FeaturedRelease[];
}

/**
 * Get currently featured artists based on the featuredOn and featuredUntil date range.
 * An artist is considered featured if:
 * - featuredOn is not null and is less than or equal to the current date
 * - featuredUntil is either null (indefinitely featured) or greater than or equal to the current date
 * - isActive is true
 *
 * @param currentDate - Optional date to use for comparison (defaults to current date)
 * @returns Array of featured artists
 */
export async function getFeaturedArtists(
  currentDate: Date = new Date()
): Promise<FeaturedArtist[]> {
  const artists = await prisma.artist.findMany({
    where: {
      isActive: true,
      featuredOn: {
        not: null,
        lte: currentDate,
      },
      OR: [{ featuredUntil: null }, { featuredUntil: { gte: currentDate } }],
    },
    select: {
      id: true,
      displayName: true,
      firstName: true,
      surname: true,
      shortBio: true,
      featuredDescription: true,
      featuredOn: true,
      featuredUntil: true,
      slug: true,
      featuredTrack: {
        select: {
          id: true,
          title: true,
          audioFile: true,
        },
      },
    },
    orderBy: {
      featuredOn: 'desc',
    },
  });

  return artists;
}

/**
 * Get currently featured releases based on the featuredOn and featuredUntil date range.
 * A release is considered featured if:
 * - featuredOn is not null and is less than or equal to the current date
 * - featuredUntil is either null (indefinitely featured) or greater than or equal to the current date
 *
 * @param currentDate - Optional date to use for comparison (defaults to current date)
 * @returns Array of featured releases with their associated artists
 */
export async function getFeaturedReleases(
  currentDate: Date = new Date()
): Promise<FeaturedRelease[]> {
  const releases = await prisma.release.findMany({
    where: {
      featuredOn: {
        not: null,
        lte: currentDate,
      },
      OR: [{ featuredUntil: null }, { featuredUntil: { gte: currentDate } }],
    },
    select: {
      id: true,
      title: true,
      description: true,
      coverArt: true,
      releasedOn: true,
      featuredOn: true,
      featuredUntil: true,
      featuredDescription: true,
      artistReleases: {
        select: {
          artist: {
            select: {
              id: true,
              displayName: true,
              firstName: true,
              surname: true,
              slug: true,
            },
          },
        },
      },
    },
    orderBy: {
      featuredOn: 'desc',
    },
  });

  return releases.map(({ artistReleases, ...release }) => ({
    ...release,
    artists: artistReleases.map((ar) => ar.artist),
  }));
}

/**
 * Get all currently featured content (artists and releases).
 *
 * @param currentDate - Optional date to use for comparison (defaults to current date)
 * @returns Object containing arrays of featured artists and releases
 */
export async function getFeaturedContent(currentDate: Date = new Date()): Promise<FeaturedContent> {
  const [artists, releases] = await Promise.all([
    getFeaturedArtists(currentDate),
    getFeaturedReleases(currentDate),
  ]);

  return {
    artists,
    releases,
  };
}
