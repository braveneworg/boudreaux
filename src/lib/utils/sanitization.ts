/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Security utilities for input sanitization
 * Prevents XSS, HTML injection, and other input-based attacks
 *
 * NOTE: These are utility functions, not server actions.
 * They can be used in both client and server code for input sanitization.
 */

import { normalize, resolve, relative, isAbsolute, sep } from 'path';

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

  // Remove null bytes and control characters
  // Build regex pattern dynamically to avoid no-control-regex lint error
  const controlCharsPattern =
    '[' +
    String.fromCharCode(0x00) +
    '-' +
    String.fromCharCode(0x08) +
    String.fromCharCode(0x0b) +
    String.fromCharCode(0x0c) +
    String.fromCharCode(0x0e) +
    '-' +
    String.fromCharCode(0x1f) +
    String.fromCharCode(0x7f) +
    ']';
  const controlCharsRegex = new RegExp(controlCharsPattern, 'g');

  return input.replace(/\0/g, '').replace(controlCharsRegex, '').trim();
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

/**
 * Sanitize file path to prevent path traversal attacks
 * This treats the input as a POSIX-style path (forward slashes) and normalizes it.
 * Rejects paths that:
 * - Are absolute paths
 * - Contain '..' segments that would escape the base directory
 * - Contain null bytes or control characters (code points < 32, excluding tab and newline)
 *
 * @param pathKey - The path/key to sanitize (e.g., from S3 object key)
 * @param baseDir - The base directory that the resolved path must stay within
 * @returns Sanitized path that is safe to use within baseDir
 * @throws Error if path is invalid or attempts to traverse outside baseDir
 */
export function sanitizeFilePath(pathKey: string, baseDir: string): string {
  if (!pathKey) {
    throw new Error('Path key cannot be empty');
  }

  // Remove null bytes
  const cleanPath = pathKey.replace(/\0/g, '');
  if (cleanPath !== pathKey) {
    throw new Error('Path contains null bytes');
  }

  // Check for control characters (code points < 32, excluding tab and newline)
  // Build regex pattern dynamically to avoid no-control-regex lint error
  const controlCharsPattern =
    '[' +
    String.fromCharCode(0x00) +
    '-' +
    String.fromCharCode(0x08) +
    String.fromCharCode(0x0b) +
    String.fromCharCode(0x0c) +
    String.fromCharCode(0x0e) +
    '-' +
    String.fromCharCode(0x1f) +
    ']';
  const controlCharsRegex = new RegExp(controlCharsPattern, 'g');

  if (controlCharsRegex.test(cleanPath)) {
    throw new Error('Path contains control characters');
  }

  // Reject absolute paths
  if (isAbsolute(cleanPath)) {
    throw new Error('Absolute paths are not allowed');
  }

  // Normalize the path (converts to platform-specific separators and resolves . and ..)
  const normalizedPath = normalize(cleanPath);

  // Check if normalized path tries to go up with '..'
  if (normalizedPath.startsWith('..' + sep) || normalizedPath === '..') {
    throw new Error('Path traversal attempt detected (..)');
  }

  // Resolve the full path within the base directory
  const resolvedBase = resolve(baseDir);
  const resolvedPath = resolve(baseDir, normalizedPath);

  // Verify the resolved path is within the base directory
  const relativePath = relative(resolvedBase, resolvedPath);
  if (relativePath.startsWith('..' + sep) || isAbsolute(relativePath)) {
    throw new Error('Resolved path escapes base directory');
  }

  return normalizedPath;
}
