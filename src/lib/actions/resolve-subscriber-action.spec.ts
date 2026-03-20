/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { resolveSubscriberAction } from './resolve-subscriber-action';

vi.mock('server-only', () => ({}));

const mockFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

const mockCreateUser = vi.fn();

vi.mock('@/lib/prisma-adapter', () => ({
  CustomPrismaAdapter: () => ({
    createUser: (...args: unknown[]) => mockCreateUser(...args),
  }),
}));

const mockSignIn = vi.fn();

vi.mock('../../../auth', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

vi.mock('unique-username-generator', () => ({
  generateUsername: () => 'testuser1234',
}));

const mockValidateEmailSecurity = vi.fn();

vi.mock('@/lib/utils/email-security', () => ({
  validateEmailSecurity: (...args: unknown[]) => mockValidateEmailSecurity(...args),
}));

describe('resolveSubscriberAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateEmailSecurity.mockReturnValue({ isValid: true });
  });

  it('should return an error when email validation fails', async () => {
    mockValidateEmailSecurity.mockReturnValue({
      isValid: false,
      error: 'Disposable email addresses are not allowed',
    });

    const result = await resolveSubscriberAction({
      email: 'test@tempmail.com',
      termsAccepted: true,
    });

    expect(result).toEqual({
      success: false,
      error: 'Disposable email addresses are not allowed',
    });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('should return a generic error when email validation fails without a message', async () => {
    mockValidateEmailSecurity.mockReturnValue({ isValid: false });

    const result = await resolveSubscriberAction({
      email: 'bad',
      termsAccepted: true,
    });

    expect(result).toEqual({
      success: false,
      error: 'Invalid email address',
    });
  });

  it('should sign in and return "existing" status for existing users', async () => {
    mockFindUnique.mockResolvedValue({ id: '1', email: 'existing@example.com' });
    mockSignIn.mockResolvedValue(undefined);

    const result = await resolveSubscriberAction({
      email: 'existing@example.com',
      termsAccepted: true,
    });

    expect(result).toEqual({ success: true, status: 'existing' });
    expect(mockSignIn).toHaveBeenCalledWith('nodemailer', {
      email: 'existing@example.com',
      redirect: false,
      redirectTo: '/',
    });
  });

  it('should return an error when terms are not accepted for new users', async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await resolveSubscriberAction({
      email: 'new@example.com',
      termsAccepted: false,
    });

    expect(result).toEqual({
      success: false,
      error: 'You must accept the terms and conditions',
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('should create a new user and sign in when terms are accepted', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({ id: '2', email: 'new@example.com' });
    mockSignIn.mockResolvedValue(undefined);

    const result = await resolveSubscriberAction({
      email: 'new@example.com',
      termsAccepted: true,
    });

    expect(result).toEqual({ success: true, status: 'created' });
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        emailVerified: null,
        name: null,
        image: null,
        username: 'testuser1234',
      })
    );
    expect(mockSignIn).toHaveBeenCalledWith('nodemailer', {
      email: 'new@example.com',
      redirect: false,
      redirectTo: '/',
    });
  });

  it('should catch and return errors when an exception is thrown', async () => {
    mockFindUnique.mockRejectedValue(new Error('Database connection failed'));

    const result = await resolveSubscriberAction({
      email: 'test@example.com',
      termsAccepted: true,
    });

    expect(result).toEqual({
      success: false,
      error: 'Database connection failed',
    });
  });

  it('should return a generic error when a non-Error is thrown', async () => {
    mockFindUnique.mockRejectedValue('unexpected');

    const result = await resolveSubscriberAction({
      email: 'test@example.com',
      termsAccepted: true,
    });

    expect(result).toEqual({
      success: false,
      error: 'An unexpected error occurred',
    });
  });
});
