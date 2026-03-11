/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { VenueRepository } from '@/lib/repositories/tours/venue-repository';
import {
  venueCreateSchema,
  venueUpdateSchema,
  type VenueCreateInput,
  type VenueUpdateInput,
} from '@/lib/validations/tours/venue-schema';

import type { Venue } from '@prisma/client';

export interface VenueQueryParams {
  search?: string;
  city?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedVenuesResponse {
  data: Venue[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Service for venue business logic.
 * Provides validation, data transformation, and orchestration of venue operations.
 */
export class VenueService {
  /**
   * Find all venues with optional filtering and pagination
   */
  static async findAll(params?: VenueQueryParams): Promise<PaginatedVenuesResponse> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 100;

    const [venues, total] = await Promise.all([
      VenueRepository.findAll(params),
      VenueRepository.count(params),
    ]);

    return {
      data: venues,
      total,
      page,
      limit,
    };
  }

  /**
   * Find a venue by ID
   */
  static async findById(id: string): Promise<Venue | null> {
    return VenueRepository.findById(id);
  }

  /**
   * Find venues by name (case-insensitive)
   */
  static async findByName(name: string): Promise<Venue[]> {
    return VenueRepository.findByName(name);
  }

  /**
   * Create a new venue with validation
   */
  static async create(input: VenueCreateInput): Promise<Venue> {
    // Validate input
    const validated = venueCreateSchema.parse(input);

    // Create venue
    return VenueRepository.create(validated);
  }

  /**
   * Update an existing venue with validation
   */
  static async update(id: string, input: VenueUpdateInput, userId: string): Promise<Venue> {
    // Validate input
    const validated = venueUpdateSchema.parse(input);

    // Update venue
    return VenueRepository.update(id, validated, userId);
  }

  /**
   * Delete a venue
   * Will fail if venue has associated tours (foreign key constraint)
   */
  static async delete(id: string): Promise<Venue> {
    return VenueRepository.delete(id);
  }

  /**
   * Check if a venue name already exists in a given city
   * @param name - Venue name to check
   * @param city - City to check within
   * @param excludeId - Optional venue ID to exclude from check (for updates)
   * @returns true if duplicate exists, false otherwise
   */
  static async checkDuplicateName(
    name: string,
    city: string,
    excludeId?: string
  ): Promise<boolean> {
    const existingVenues = await VenueRepository.findByName(name);

    // Check if any matching venues are in the same city
    const duplicates = existingVenues.filter((venue) => {
      // Exclude the venue being updated
      if (excludeId && venue.id === excludeId) {
        return false;
      }

      // Check if city matches (case-insensitive)
      return venue.city.toLowerCase() === city.toLowerCase();
    });

    return duplicates.length > 0;
  }
}
