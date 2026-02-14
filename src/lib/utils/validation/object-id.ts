/**
 * MongoDB ObjectId format validation
 * Matches 24-character hex strings (case-insensitive)
 */
export const OBJECT_ID_REGEX = /^[a-f0-9]{24}$/i;

/**
 * Validates that a string is a valid MongoDB ObjectId format
 */
export const isValidObjectId = (id: string): boolean => OBJECT_ID_REGEX.test(id);
