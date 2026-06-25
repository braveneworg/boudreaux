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
export const sanitizeHtml = (input: string): string => {
  if (!input) return '';

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Sanitize string input by removing potentially dangerous characters
 * while preserving legitimate special characters for names, addresses, etc.
 */
export const sanitizeString = (input: string): string => {
  if (!input) return '';

  // Remove null bytes and control characters (0x00–0x08, 0x0b, 0x0c, 0x0e–0x1f, 0x7f)
  // by code point. A regex literal containing these would trip core `no-control-regex`,
  // and a RegExp built from a string would trip `security/detect-non-literal-regexp`.
  let stripped = '';
  for (const char of input) {
    const code = char.charCodeAt(0);
    const isControl =
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f;
    if (!isControl) stripped += char;
  }

  return stripped.trim();
};

/**
 * Sanitize email addresses
 * Note: Zod already validates format, this adds extra protection
 */
export const sanitizeEmail = (email: string): string => {
  if (!email) return '';

  return email
    .toLowerCase()
    .trim()
    .replace(/[^\w\s@.+-]/g, ''); // Only allow email-safe characters
};

/**
 * Sanitize phone numbers - remove all non-numeric characters except + and spaces
 */
export const sanitizePhone = (phone: string): string => {
  if (!phone) return '';

  return phone.replace(/[^\d\s+()-]/g, '');
};

/**
 * Sanitize URL input
 */
export const sanitizeUrl = (url: string): string => {
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
};

/**
 * Sanitize usernames - alphanumeric, dots, dashes, underscores only
 */
export const sanitizeUsername = (username: string): string => {
  if (!username) return '';

  return username
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]/g, '');
};

/**
 * Remove excessive whitespace and normalize spacing
 */
export const normalizeWhitespace = (input: string): string => {
  if (!input) return '';

  return input
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
};

/**
 * Comprehensive sanitization for text fields (names, addresses, etc.)
 */
export const sanitizeTextField = (input: string): string => {
  if (!input) return '';

  return normalizeWhitespace(sanitizeString(input));
};

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
/**
 * Reject a path that contains a control character (code points < 32, excluding
 * tab and newline). A regex literal with these chars trips core
 * `no-control-regex`; a RegExp built from a string trips
 * `security/detect-non-literal-regexp`, so we scan by code point.
 */
const assertNoControlCharacters = (path: string): void => {
  for (const char of path) {
    const code = char.charCodeAt(0);
    const isControl =
      code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f);
    if (isControl) {
      throw new Error('Path contains control characters');
    }
  }
};

/**
 * Verify the normalized path, once resolved against `baseDir`, does not escape
 * the base directory via `..` segments or an absolute path.
 */
const assertWithinBaseDir = (normalizedPath: string, baseDir: string): void => {
  const resolvedBase = resolve(baseDir);
  const resolvedPath = resolve(baseDir, normalizedPath);

  const relativePath = relative(resolvedBase, resolvedPath);
  if (relativePath.startsWith('..' + sep) || isAbsolute(relativePath)) {
    throw new Error('Resolved path escapes base directory');
  }
};

export const sanitizeFilePath = (pathKey: string, baseDir: string): string => {
  if (!pathKey) {
    throw new Error('Path key cannot be empty');
  }

  // Remove null bytes
  const cleanPath = pathKey.replace(/\0/g, '');
  if (cleanPath !== pathKey) {
    throw new Error('Path contains null bytes');
  }

  assertNoControlCharacters(cleanPath);

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

  // Verify the resolved path is within the base directory
  assertWithinBaseDir(normalizedPath, baseDir);

  return normalizedPath;
};
