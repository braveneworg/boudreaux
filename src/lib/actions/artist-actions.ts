'use server';

import { ArtistService } from '@/lib/services/artist-service';
import type { ServiceResponse } from '@/lib/services/service.types';
import type { Artist } from '@/lib/types/media-models';

export async function createArtistAction(artist: Artist): Promise<ServiceResponse<Artist>> {
  try {
    const { images, urls, ...artistData } = artist;
    const newArtist = (await ArtistService.createArtist({
      ...artistData,
      images: {
        connectOrCreate:
          images?.map((image) => ({
            where: { id: image.id },
            create: { ...image },
          })) || [],
      },
      urls: {
        connectOrCreate:
          urls?.map((url) => ({
            where: { id: url.id },
            create: { ...url },
          })) || [],
      },
    })) as unknown as Artist;

    return { success: true, data: newArtist };
  } catch (error) {
    console.error('Error creating artist:', error);
    return { success: false, error: 'Failed to create artist' };
  }
}
