'use server';

import { ArtistService } from '@/lib/services/artist-service';
import type { ServiceResponse } from '@/lib/services/service.types';
import type { Artist } from '@/lib/types/media-models';

import type { Prisma } from '@prisma/client';

export async function createArtistAction(artist: Artist): Promise<ServiceResponse<Artist>> {
  try {
    const {
      images,
      urls,
      labels: _labels,
      groups: _groups,
      releases: _releases,
      ...artistData
    } = artist;

    const createInput: Prisma.ArtistCreateInput = {
      ...artistData,
      images: images
        ? {
            connectOrCreate: images.map((image) => ({
              where: { id: image.id },
              create: { ...image },
            })),
          }
        : undefined,
      urls: urls
        ? {
            connectOrCreate: urls.map((url) => ({
              where: { id: url.id },
              create: { ...url },
            })),
          }
        : undefined,
    };

    const result = await ArtistService.createArtist(createInput);

    return result;
  } catch (error) {
    console.error('Error creating artist:', error);
    return { success: false, error: 'Failed to create artist' };
  }
}
