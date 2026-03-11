/**
 * TypeScript type definitions for Tour Management
 * Generated from data-model.md and API contracts
 */

// ============================================================================
// Core Domain Models (from Prisma)
// ============================================================================

export interface Tour {
  id: string;
  title: string;
  subtitle: string | null;
  subtitle2: string | null;
  description: string | null;
  notes: string | null;
  ticketsUrl: string | null;
  ticketPrice: string | null;
  startDate: Date;
  endDate: Date | null;
  showStartTime: Date;
  showEndTime: Date | null;
  venueId: string;
  venue: Venue;
  headliners: TourHeadliner[];
  images: TourImage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  tours: Tour[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TourHeadliner {
  id: string;
  tourId: string;
  artistId: string;
  order: number;
  tour: Tour;
  artist: Artist;
}

export interface TourImage {
  id: string;
  tourId: string;
  s3Key: string;
  s3Url: string;
  s3Bucket: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  displayOrder: number;
  altText: string | null;
  tour: Tour;
}

// ============================================================================
// Related Models (existing)
// ============================================================================

export interface Artist {
  id: string;
  firstName: string;
  surname: string;
  displayName: string | null;
  bio: string | null;
  groups: ArtistGroup[];
  tourHeadliners: TourHeadliner[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Group {
  id: string;
  displayName: string;
  bio: string | null;
  artists: ArtistGroup[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ArtistGroup {
  id: string;
  artistId: string;
  groupId: string;
  artist: Artist;
  group: Group;
}

// ============================================================================
// Form Data Types (client-side)
// ============================================================================

export interface TourFormData {
  title: string;
  subtitle?: string;
  subtitle2?: string;
  description?: string;
  notes?: string;
  ticketsUrl?: string;
  ticketPrice?: string;
  startDate: Date;
  endDate?: Date;
  showStartTime: Date;
  showEndTime?: Date;
  venueId: string;
  headlinerIds: string[];
}

export interface VenueFormData {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface ImageUploadFormData {
  file: File;
  altText?: string;
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
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
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
 * 2. Fall back to group.displayName if artist is in a group
 * 3. Fall back to firstName + " " + surname
 * 4. Fall back to "Unknown Artist"
 */
export type GetArtistDisplayName = (
  artist: Artist & { groups: Array<ArtistGroup & { group: Group }> }
) => string;

// ============================================================================
// Repository Layer Types
// ============================================================================

export interface TourRepository {
  findAll(query?: TourListQuery): Promise<TourListItem[]>;
  findById(id: string): Promise<TourDetail | null>;
  create(data: TourCreateInput): Promise<TourDetail>;
  update(id: string, data: TourUpdateInput): Promise<TourDetail>;
  delete(id: string): Promise<void>;
  search(query: TourSearchQuery): Promise<PaginatedResponse<TourListItem>>;
}

export interface VenueRepository {
  findAll(): Promise<VenueDisplay[]>;
  findById(id: string): Promise<VenueDisplay | null>;
  create(data: VenueCreateInput): Promise<VenueDisplay>;
  update(id: string, data: VenueCreateInput): Promise<VenueDisplay>;
  delete(id: string): Promise<void>;
}

export interface TourImageRepository {
  findByTourId(tourId: string): Promise<ImageDisplay[]>;
  create(tourId: string, data: ImageUploadRequest): Promise<ImageDisplay>;
  delete(id: string): Promise<void>;
  updateDisplayOrder(imageId: string, order: number): Promise<void>;
}

// ============================================================================
// Service Layer Types
// ============================================================================

export interface TourService {
  listTours(query?: TourListQuery): Promise<TourListItem[]>;
  getTourById(id: string): Promise<TourDetail | null>;
  createTour(data: TourFormData): Promise<ActionResult<TourDetail>>;
  updateTour(id: string, data: TourFormData): Promise<ActionResult<TourDetail>>;
  deleteTour(id: string): Promise<ActionResult>;
  searchTours(query: TourSearchQuery): Promise<PaginatedResponse<TourListItem>>;
}

export interface ImageUploadService {
  generateUploadUrl(
    tourId: string,
    request: ImageUploadRequest
  ): Promise<ActionResult<ImageUploadResponse>>;
  confirmUpload(imageId: string): Promise<ActionResult>;
  deleteImage(imageId: string): Promise<ActionResult>;
  reorderImages(tourId: string, imageIds: string[]): Promise<ActionResult>;
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
