export const toPascalCase = (str: string): string => {
  // Split on whitespace and special characters (but preserve apostrophes in words)
  return str
    .split(/[\s\-_]+/)
    .filter((word) => word.length > 0)
    .map((word) => {
      // For each word, capitalize letters after apostrophes and at the start
      return word.replace(
        /(\w)(\w*)/g,
        (_, firstChar, rest) => firstChar.toUpperCase() + rest.slice(0)
      );
    })
    .join('');
};

/**
 * Converts a string to Title Case with spaces preserved
 * e.g., "featured artist" -> "Featured Artist"
 */
export const toTitleCase = (str: string): string => {
  return str
    .split(/[\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Converts a camelCase string to a human-readable display label
 * e.g., "featuredArtist" -> "featured artist"
 */
export const toDisplayLabel = (str: string): string => {
  return str.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
};

/**
 * Converts a camelCase string to kebab-case
 * e.g., "featuredArtist" -> "featured-artist"
 */
export const toKebabCase = (str: string): string => {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
};

/**
 * Converts an entity name to its URL-friendly plural form
 * e.g., "featuredArtist" -> "featured-artists"
 */
export const toEntityUrlPath = (entity: string): string => {
  const kebab = toKebabCase(entity);
  return `${kebab}s`;
};
