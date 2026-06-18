/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FormState } from '@/lib/types/form-state';

interface ResponseError {
  errors: {
    general?: string[];
  };
}

interface MongoServerError extends Error {
  name: 'MongoServerError';
  code: number;
  keyPattern?: Record<string, number>;
}

const setUnknownError = (data: FormState, errorMessage = 'An unknown error occurred') => {
  if (!data.errors) {
    data.errors = {};
  }

  if (!data.errors.general) {
    data.errors.general = [];
  }

  data.errors.general.push(errorMessage);
};

// More robust email validation built from star-height-1 regexes so the
// safe-regex heuristic accepts each pattern (no nested quantifiers / ReDoS).
// Reproduces the language of the former monolithic EMAIL_REGEX exactly:
//   local: runs of allowed chars separated by single dots (no leading/trailing/double dot)
//   domain: >=2 labels, each 1-63 chars, alnum start/end, internal hyphen allowed
const LOCAL_LABEL_REGEX = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+$/;
const DOMAIN_LABEL_SINGLE_REGEX = /^[a-zA-Z0-9]$/;
const DOMAIN_LABEL_MULTI_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]$/;

const isDomainLabel = (label: string): boolean =>
  DOMAIN_LABEL_SINGLE_REGEX.test(label) || DOMAIN_LABEL_MULTI_REGEX.test(label);

/**
 * Validates the syntactic format of an email address (local@domain) without
 * the overall-length cap that {@link isValidEmail} applies. Equivalent to the
 * previous EMAIL_REGEX but expressed as star-height-1 sub-patterns.
 */
export const isValidEmailFormat = (value: string): boolean => {
  const at = value.indexOf('@');
  if (at === -1) return false;
  // Require exactly one '@'.
  if (value.indexOf('@', at + 1) !== -1) return false;

  const localPart = value.slice(0, at);
  const domain = value.slice(at + 1);

  // Local part: dot-separated, every segment non-empty and within the allowed
  // character class. Empty segments would mean a leading/trailing/double dot.
  if (localPart.length === 0) return false;
  if (localPart.split('.').some((segment) => !LOCAL_LABEL_REGEX.test(segment))) {
    return false;
  }

  // Domain: at least two labels, each a valid domain label.
  if (domain.length === 0) return false;
  const domainLabels = domain.split('.');
  if (domainLabels.length < 2) return false;
  if (domainLabels.some((label) => !isDomainLabel(label))) return false;

  return true;
};

// Alternative: More readable with helper function
export const isValidEmail = (email: string): boolean => {
  if (!email || email.length > 254) return false;

  const [localPart, ...domainParts] = email.split('@');
  if (domainParts.length !== 1) return false;

  const domain = domainParts[0];

  // Validate local part (before @)
  if (!localPart || localPart.length > 64) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (localPart.includes('..')) return false;

  // Validate domain
  if (!domain || !domain.includes('.')) return false;

  return isValidEmailFormat(email);
};

export { setUnknownError };
export type { ResponseError, MongoServerError };
