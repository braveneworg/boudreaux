/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * TypeScript type definitions for Tour Management
 * Adapted from contracts/tour-types.ts
 */

import type {
  Tour as PrismaTour,
  Venue as PrismaVenue,
  TourDateHeadliner as PrismaTourHeadliner,
  TourImage as PrismaTourImage,
  Artist,
} from '@prisma/client';

// ============================================================================
// Core Domain Models (extending Prisma types)
// ============================================================================

export type Tour = PrismaTour & {
  venue: Venue;
  headliners: TourHeadliner[];
  images: TourImage[];
};

export type Venue = PrismaVenue & {
  tours?: Tour[];
};

export type TourHeadliner = PrismaTourHeadliner & {
  tour?: Tour;
  artist: Artist;
};

export type TourImage = PrismaTourImage & {
  tour?: Tour;
};

// ============================================================================
// Form Data Types (client-side)
// ============================================================================

export interface TourFormData {
  title: string;
  subtitle?: string | null;
  subtitle2?: string | null;
  description?: string | null;
  notes?: string | null;
  ticketsUrl?: string | null;
  ticketPrice?: string | null;
  startDate: Date | string;
  endDate?: Date | string | null;
  showStartTime: Date | string;
  showEndTime?: Date | string | null;
  venueId: string;
  headlinerIds: string[];
}

export interface VenueFormData {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
}

export interface ImageUploadFormData {
  file: File;
  altText?: string | null;
  displayOrder?: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface TourCreateInput {
  title: string;
  subtitle?: string | null;
  subtitle2?: string | null;
  description?: string | null;
  notes?: string | null;
  ticketsUrl?: string | null;
  ticketPrice?: string | null;
  startDate: string; // ISO 8601
  endDate?: string | null; // ISO 8601
  showStartTime: string; // ISO 8601
  showEndTime?: string | null; // ISO 8601
  venueId: string;
  headlinerIds: string[];
}

export interface TourUpdateInput {
  title?: string;
  subtitle?: string | null;
  subtitle2?: string | null;
  description?: string | null;
  notes?: string | null;
  ticketsUrl?: string | null;
  ticketPrice?: string | null;
  startDate?: string; // ISO 8601
  endDate?: string | null; // ISO 8601
  showStartTime?: string; // ISO 8601
  showEndTime?: string | null; // ISO 8601
  venueId?: string;
  headlinerIds?: string[];
}

export interface VenueCreateInput {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
}

export interface ImageUploadRequest {
  fileName: string;
  fileSize: number;
  mimeType: ImageMimeType;
  altText?: string | null;
}

export interface ImageUploadResponse {
  uploadUrl: string;
  imageId: string;
  s3Key: string;
}

// ============================================================================
// List/Display Types (with computed fields)
// ============================================================================

export interface TourListItem {
  id: string;
  title: string;
  subtitle: string | null;
  subtitle2: string | null;
  startDate: Date;
  endDate: Date | null;
  showStartTime: Date;
  showEndTime: Date | null;
  venue: VenueDisplay;
  headliners: ArtistDisplay[];
  primaryImage: ImageDisplay | null;
  ticketsUrl: string | null;
  ticketPrice: string | null;
}

export interface TourDetail extends TourListItem {
  description: string | null;
  notes: string | null;
  images: ImageDisplay[];
}

export interface VenueDisplay {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
}

export interface ArtistDisplay {
  id: string;
  displayName: string; // Computed with fallback logic
  order: number; // From TourHeadliner junction table
}

export interface ImageDisplay {
  id: string;
  s3Url: string;
  fileName: string;
  displayOrder: number;
  altText: string | null;
}

// ============================================================================
// API Response Wrappers
// ============================================================================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: Record<string, unknown>;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// Paginated Response
// ============================================================================

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  total: number;
  offset: number;
  limit: number;
}

// ============================================================================
// Query/Filter Types
// ============================================================================

export interface TourListQuery {
  limit?: number;
  offset?: number;
  sortBy?: 'startDate' | 'title';
  order?: 'asc' | 'desc';
}

export interface TourSearchQuery extends TourListQuery {
  artistName?: string;
  venueName?: string;
  startDateFrom?: Date;
  startDateTo?: Date;
}

// ============================================================================
// Utility Types
// ============================================================================

export type TourFormMode = 'create' | 'edit';
export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface ValidationError {
  field: string;
  message: string;
}

export interface FormState<T> {
  data: T;
  errors: ValidationError[];
  isSubmitting: boolean;
  isDirty: boolean;
}

// ============================================================================
// Server Action Return Types
// ============================================================================

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: ValidationError[];
}

// ============================================================================
// Artist Display Name Computation
// ============================================================================

/**
 * Function type for computing artist display name with fallback logic
 * Algorithm:
 * 1. Use artist.displayName if present
 * 2. Fall back to firstName + " " + surname
 * 3. Fall back to null
 */
export type GetArtistDisplayName = (artist: Artist) => string | null;

// ============================================================================
// Service Response Type (matching existing pattern)
// ============================================================================

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface TourFormProps {
  mode: TourFormMode;
  initialData?: TourDetail;
  onSuccess?: (tour: TourDetail) => void;
  onCancel?: () => void;
}

export interface TourListProps {
  tours: TourListItem[];
  onTourClick?: (tourId: string) => void;
}

export interface TourCardProps {
  tour: TourListItem;
  onClick?: () => void;
}

export interface ImageUploadProps {
  tourId: string;
  existingImages: ImageDisplay[];
  maxImages?: number;
  onUploadComplete?: (image: ImageDisplay) => void;
  onDeleteImage?: (imageId: string) => void;
}

export interface VenueSelectProps {
  value: string;
  onChange: (venueId: string) => void;
  venues: VenueDisplay[];
  onCreateNew?: () => void;
}

export interface ArtistMultiSelectProps {
  value: string[];
  onChange: (artistIds: string[]) => void;
  artists: ArtistDisplay[];
}
