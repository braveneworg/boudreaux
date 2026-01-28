/**
 * Security utilities for input sanitization
 * Prevents XSS, HTML injection, and other input-based attacks
 *
 * NOTE: These are utility functions, not server actions.
 * They can be used in both client and server code for input sanitization.
 */

/**
 * Sanitize HTML input by escaping dangerous characters
 * Use this before storing user input in database
 */
export function sanitizeHtml(input: string): string {
  if (!input) return '';

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize string input by removing potentially dangerous characters
 * while preserving legitimate special characters for names, addresses, etc.
 */
export function sanitizeString(input: string): string {
  if (!input) return '';

  // Remove null bytes, control characters, and special Unicode
  return input
    .replace(/\0/g, '') // Null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Control characters
    .trim();
}

/**
 * Sanitize email addresses
 * Note: Zod already validates format, this adds extra protection
 */
export function sanitizeEmail(email: string): string {
  if (!email) return '';

  return email
    .toLowerCase()
    .trim()
    .replace(/[^\w\s@.+-]/g, ''); // Only allow email-safe characters
}

/**
 * Sanitize phone numbers - remove all non-numeric characters except + and spaces
 */
export function sanitizePhone(phone: string): string {
  if (!phone) return '';

  return phone.replace(/[^\d\s+()-]/g, '');
}

/**
 * Sanitize URL input
 */
export function sanitizeUrl(url: string): string {
  if (!url) return '';

  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw Error('Invalid protocol');
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Sanitize usernames - alphanumeric, dots, dashes, underscores only
 */
export function sanitizeUsername(username: string): string {
  if (!username) return '';

  return username
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]/g, '');
}

/**
 * Remove excessive whitespace and normalize spacing
 */
export function normalizeWhitespace(input: string): string {
  if (!input) return '';

  return input
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
}

/**
 * Comprehensive sanitization for text fields (names, addresses, etc.)
 */
export function sanitizeTextField(input: string): string {
  if (!input) return '';

  return normalizeWhitespace(sanitizeString(input));
}
