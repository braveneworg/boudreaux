/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { FeaturedArtistRepository } from '@/lib/repositories/featured-artist-repository';
import type {
  CreateFeaturedArtistData,
  FeaturedArtist,
  FeaturedArtistListFilters,
  UpdateFeaturedArtistData,
} from '@/lib/types/domain/featured-artist';
import { withCache } from '@/lib/utils/simple-cache';

import { failFromError } from './_internal/map-data-error';

import type { ServiceResponse } from './service.types';

export class FeaturedArtistsService {
  static async createFeaturedArtist(
    data: CreateFeaturedArtistData
  ): Promise<ServiceResponse<FeaturedArtist>> {
    try {
      const artist = await FeaturedArtistRepository.create(data);
      return { success: true, data: artist };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to create artist' });
    }
  }

  static async getFeaturedArtists(
    currentDate: Date,
    limit = 10
  ): Promise<ServiceResponse<FeaturedArtist[]>> {
    // Create a cache key based on date and limit
    const cacheKey = `featured-artists:${currentDate.toISOString().split('T')[0]}:${limit}`;

    return withCache(
      cacheKey,
      async () => {
        try {
          const artists = await FeaturedArtistRepository.findFeatured(currentDate, limit);

          return { success: true as const, data: artists };
        } catch (error) {
          return failFromError(error, { UNKNOWN: 'Failed to fetch artists' });
        }
      },
      process.env.NODE_ENV === 'development' || process.env.E2E_MODE === 'true' ? 0 : 600 // Cache for 10 minutes; disabled in E2E to avoid stale data from webServer health check
    );
  }

  /**
   * Get all featured artists for admin (no date filter, includes all).
   *
   * Supports server-side `search` plus a `published` filter. The
   * FeaturedArtist model has no `deletedOn` field, so the `deleted` param is
   * accepted for a uniform admin API but applies no soft-delete constraint. The
   * repository owns the Mongo-safe `where` construction.
   *
   * - `published === true` → only featured artists with a `publishedOn` date.
   * - `published === false` → only featured artists without a `publishedOn` date.
   * - `published == null` → no publish filter.
   */
  static async getAllFeaturedArtists(
    params?: FeaturedArtistListFilters
  ): Promise<ServiceResponse<FeaturedArtist[]>> {
    try {
      const featuredArtists = await FeaturedArtistRepository.findAll(params ?? {});

      return { success: true, data: featuredArtists };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to retrieve featured artists' });
    }
  }

  /**
   * Get a featured artist by ID
   */
  static async getFeaturedArtistById(id: string): Promise<ServiceResponse<FeaturedArtist>> {
    try {
      const featuredArtist = await FeaturedArtistRepository.findById(id);

      if (!featuredArtist) {
        return { success: false, error: 'Featured artist not found', code: 'NOT_FOUND' };
      }

      return { success: true, data: featuredArtist };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to retrieve featured artist' });
    }
  }

  /**
   * Update a featured artist by ID
   */
  static async updateFeaturedArtist(
    id: string,
    data: UpdateFeaturedArtistData
  ): Promise<ServiceResponse<FeaturedArtist>> {
    try {
      const featuredArtist = await FeaturedArtistRepository.update(id, data);

      return { success: true, data: featuredArtist };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Featured artist not found',
        UNKNOWN: 'Failed to update featured artist',
      });
    }
  }

  /**
   * Hard delete a featured artist by ID
   */
  static async hardDeleteFeaturedArtist(id: string): Promise<ServiceResponse<FeaturedArtist>> {
    try {
      const featuredArtist = await FeaturedArtistRepository.delete(id);

      return { success: true, data: featuredArtist };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Featured artist not found',
        UNKNOWN: 'Failed to delete featured artist',
      });
    }
  }

  /**
   * Publish a single featured artist by stamping `publishedOn` with the current
   * time. Distinct from {@link publishFeaturedArtistsToSiteAction}, which
   * republishes the whole active set to the landing page.
   */
  static async publishFeaturedArtist(id: string): Promise<ServiceResponse<FeaturedArtist>> {
    try {
      const featuredArtist = await FeaturedArtistRepository.update(id, {
        publishedOn: new Date(),
      });

      return { success: true, data: featuredArtist };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Featured artist not found',
        UNKNOWN: 'Failed to publish featured artist',
      });
    }
  }
}
