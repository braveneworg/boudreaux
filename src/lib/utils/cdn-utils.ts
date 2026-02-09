import { CONSTANTS } from '@/lib/constants';

/**
 * Build a CDN URL for a media asset
 * @param path - The path to the asset (e.g., '/media/image.png' or 'media/image.png')
 * @returns The full CDN URL
 */
export function getCdnUrl(path: string): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  // Ensure path starts with 'media/'
  const finalPath = cleanPath.startsWith('media/') ? cleanPath : `media/${cleanPath}`;
  return `${CONSTANTS.CDN.BASE_URL}/${finalPath}`;
}
