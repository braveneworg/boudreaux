'use server';

import { ArtistService } from '@/lib/services/artist-service';
import type { ServiceResponse } from '@/lib/services/service.types';
import type { Artist } from '@/lib/types/media-models';

import type { Prisma } from '@prisma/client';

type ArtistCreateData = Prisma.ArtistCreateInput & {
  images?: Array<{ id: string; [key: string]: unknown }>;
  urls?: Array<{ id: string; [key: string]: unknown }>;
};

export async function createArtistAction(
  artist: ArtistCreateData
): Promise<ServiceResponse<Artist>> {
  try {
    const { images, urls, ...artistData } = artist;
    const result = await ArtistService.createArtist({
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
    } as Prisma.ArtistCreateInput);

    if (!result.success) {
      return result;
    }

    return { success: true, data: result.data };
  } catch (error) {
    console.error('Error creating artist:', error);
    return { success: false, error: 'Failed to create artist' };
  }
}
