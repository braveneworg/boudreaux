/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { TourRepository, type TourWithRelations } from '@/lib/repositories/tours/tour-repository';
import {
  tourCreateSchema,
  tourUpdateSchema,
  type TourCreateInput,
  type TourUpdateInput,
} from '@/lib/validations/tours/tour-schema';

import type { Tour } from '@prisma/client';

/**
 * Explicit base fields matching the Prisma Tour model.
 * Ensures TourWithDisplayNames always has the correct shape
 * even if generated Prisma types are stale.
 */
interface TourBaseFields {
  id: string;
  title: string;
  subtitle: string | null;
  subtitle2: string | null;
  description: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface TourQueryParams {
  search?: string;
  page?: number;
  limit?: number;
}

export interface TourWithDisplayNames extends TourBaseFields {
  displayHeadliners: string[];
}

export interface PaginatedToursResponse {
  data: TourWithDisplayNames[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Service for tour business logic.
 * Provides validation, data transformation, and orchestration of tour operations.
 */
export class TourService {
  /**
   * Find all tours with optional filtering and pagination
   * Enriches tours with displayHeadliners array
   */
  static async findAll(params?: TourQueryParams): Promise<PaginatedToursResponse> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 100;

    const [tours, total] = await Promise.all([
      TourRepository.findAll(params),
      TourRepository.count(params),
    ]);

    // Enrich tours with display names
    const enrichedTours = tours.map((tour) => this.enrichTourWithDisplayNames(tour));

    return {
      data: enrichedTours,
      total,
      page,
      limit,
    };
  }

  /**
   * Find a tour by ID
   * Returns tour with displayHeadliners array
   */
  static async findById(id: string): Promise<TourWithDisplayNames | null> {
    const tour = await TourRepository.findById(id);

    if (!tour) {
      return null;
    }

    return this.enrichTourWithDisplayNames(tour);
  }

  /**
   * Create a new tour with validation
   */
  static async create(input: TourCreateInput): Promise<TourWithDisplayNames> {
    // Validate input
    const validated = tourCreateSchema.parse(input);

    // Create tour
    const tour = await TourRepository.create(validated);

    return this.enrichTourWithDisplayNames(tour);
  }

  /**
   * Update an existing tour with validation
   */
  static async update(
    id: string,
    input: TourUpdateInput,
    userId: string
  ): Promise<TourWithDisplayNames> {
    // Validate input
    const validated = tourUpdateSchema.parse(input);

    // Update tour
    const tour = await TourRepository.update(id, validated, userId);

    return this.enrichTourWithDisplayNames(tour);
  }

  /**
   * Delete a tour
   * Cascades to related records (headliners, images)
   */
  static async delete(id: string): Promise<Tour> {
    return TourRepository.delete(id);
  }

  /**
   * Enrich a tour with displayHeadliners array
   * Aggregates unique headliners from all tour dates
   * @private
   */
  private static enrichTourWithDisplayNames(tour: TourWithRelations | Tour): TourWithDisplayNames {
    let displayHeadliners: string[] = [];

    // Extract headliners from tour dates if available
    if ('tourDates' in tour && Array.isArray(tour.tourDates)) {
      const headlinerNames = new Set<string>();

      for (const tourDate of tour.tourDates) {
        if (tourDate.headliners && Array.isArray(tourDate.headliners)) {
          for (const headliner of tourDate.headliners) {
            const name = this.getArtistDisplayName(headliner);
            if (name) {
              headlinerNames.add(name);
            }
          }
        }
      }

      displayHeadliners = Array.from(headlinerNames);
    }

    return {
      ...tour,
      displayHeadliners,
    } as TourWithDisplayNames;
  }

  /**
   * Get display name for a tour headliner
   * Priority: artist.displayName > "firstName surname" > firstName > surname > null
   * @private
   */
  private static getArtistDisplayName(headliner: {
    artist?: { displayName?: string | null; firstName?: string; surname?: string } | null;
  }): string | null {
    // Handle artist headliners
    if (headliner.artist) {
      const { displayName, firstName, surname } = headliner.artist;

      // Use displayName if available
      if (displayName) {
        return displayName;
      }

      // Build name from firstName and surname
      const nameParts: string[] = [];
      if (firstName) nameParts.push(firstName);
      if (surname) nameParts.push(surname);

      if (nameParts.length > 0) {
        return nameParts.join(' ');
      }
    }

    // No name available
    return null;
  }
}
