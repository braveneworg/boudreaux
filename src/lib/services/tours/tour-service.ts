/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { TourRepository, type TourWithRelations } from '@/lib/repositories/tours/tour-repository';
import type { TourScalars } from '@/lib/types/tours';
import type { TourCreateInput, TourUpdateInput } from '@/lib/validation/tours/tour-schema';

export type { TourWithRelations };

export interface TourQueryParams {
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedToursResponse {
  data: TourWithRelations[];
  total: number;
  page: number;
  limit: number;
}

/** One skip/offset page of the public tours listing. */
export interface PublicTourPageParams {
  skip: number;
  take: number;
  search?: string;
}

/**
 * Service for tours. Callers reach the tour repository only through it
 * (ADR-0002); input arrives already parsed by the action or route.
 */
export class TourService {
  /** Every tour, with its dates, for the admin listing. */
  static async findAll(params?: TourQueryParams): Promise<PaginatedToursResponse> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 100;

    const [tours, total] = await Promise.all([
      TourRepository.findAll(params),
      TourRepository.count(params),
    ]);

    return { data: tours, total, page, limit };
  }

  /** One page of the tours, dates and headliners the public may see (ADR-0015). */
  static async findPublicPage(params: PublicTourPageParams): Promise<TourWithRelations[]> {
    return TourRepository.findAllPublic(params);
  }

  /** A tour as the public may see it, or null when it has nothing public. */
  static async findPublicById(id: string): Promise<TourWithRelations | null> {
    return TourRepository.findPublicById(id);
  }

  /** A tour with every date and headliner whatever their state, for the admin edit form. */
  static async findAdminById(id: string): Promise<TourWithRelations | null> {
    return TourRepository.findById(id);
  }

  /** Create a tour. */
  static async create(input: TourCreateInput): Promise<TourScalars> {
    return TourRepository.create(input);
  }

  /** Update a tour, recording who changed it. */
  static async update(id: string, input: TourUpdateInput, userId: string): Promise<TourScalars> {
    return TourRepository.update(id, input, userId);
  }

  /** Delete a tour; its headliners and images cascade. */
  static async delete(id: string): Promise<TourScalars> {
    return TourRepository.delete(id);
  }
}
