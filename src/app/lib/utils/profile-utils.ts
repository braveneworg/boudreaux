/**
 * Splits a full name into first and last name components
 * @param fullName - The full name to split
 * @returns Object with firstName and lastName
 */
export function splitFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  if (!fullName) {
    return { firstName: '', lastName: '' };
  }

  const names = fullName.trim().split(/\s+/); // Split on one or more whitespace characters

  if (names.length === 0) {
    return { firstName: '', lastName: '' };
  }

  if (names.length === 1) {
    return { firstName: names[0], lastName: '' };
  }

  // First name is the first part, last name is everything else joined with single spaces
  const firstName = names[0];
  const lastName = names.slice(1).join(' ');

  return { firstName, lastName };
}

/**
 * Formats a phone number for display
 * @param phone - The phone number to format
 * @returns Formatted phone number or empty string
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';

  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');

  // Format as (XXX) XXX-XXXX for US numbers
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  // Return original if we can't format
  return phone;
}