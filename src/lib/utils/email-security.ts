/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Email security utilities
 */

// Common disposable email domains (add more as needed)
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'trashmail.com',
  'throwaway.email',
  'temp-mail.org',
  'getnada.com',
  'maildrop.cc',
];

/**
 * Check if an email domain is from a disposable email service
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;

  return DISPOSABLE_EMAIL_DOMAINS.some(
    (disposable) => domain === disposable || domain.endsWith('.' + disposable)
  );
}

/**
 * Enhanced email validation with security checks
 */
export function validateEmailSecurity(email: string): {
  isValid: boolean;
  error?: string;
} {
  // Basic format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Invalid email format' };
  }

  // Check for disposable email
  if (isDisposableEmail(email)) {
    return {
      isValid: false,
      error: 'Disposable email addresses are not allowed',
    };
  }

  // Check for suspicious patterns
  const localPart = email.split('@')[0];
  if (localPart && localPart.length > 64) {
    return { isValid: false, error: 'Email address is too long' };
  }

  return { isValid: true };
}
