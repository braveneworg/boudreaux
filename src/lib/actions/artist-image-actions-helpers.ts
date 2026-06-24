/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Validate an array of uploaded image files against the allowed MIME types and
 * the 5MB per-file size cap. Returns the first violation's user-facing message,
 * or `null` when every file is acceptable. Mirrors the prior inline loop +
 * messages exactly.
 */
export const validateImageFiles = (files: File[]): string | null => {
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return `Invalid file type: ${file.type}. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`;
    }
    if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
      return `File ${file.name} exceeds maximum size of 5MB`;
    }
  }

  return null;
};
