import bcrypt from 'bcryptjs';
import { FormState } from '../../types/form-state';

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

// More robust email validation
// Regex that prevents consecutive dots in local part and requires domain extension
const EMAIL_REGEX =
  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

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

  return EMAIL_REGEX.test(email);
};

const getHashedPassword = async (password: string): Promise<string> =>
  new Promise((resolve, reject) => {
    bcrypt.hash(password, 12, (error, hash) => {
      if (error) {
        reject(error);
      }

      if (hash) {
        resolve(hash);
      }

      reject(new Error('Failed to hash password'));
    });
  });

export { EMAIL_REGEX, getHashedPassword, setUnknownError };
export type { ResponseError, MongoServerError };
