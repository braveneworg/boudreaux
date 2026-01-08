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
