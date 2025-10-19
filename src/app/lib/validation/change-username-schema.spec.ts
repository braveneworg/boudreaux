import changeUsernameSchema, { type ChangeUsernameFormData } from './change-username-schema';

describe('changeUsernameSchema', () => {
  describe('valid data', () => {
    it('should accept valid username data', () => {
      const validData: ChangeUsernameFormData = {
        username: 'test-user_123',
        confirmUsername: 'test-user_123',
      };

      const result = changeUsernameSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should accept username with letters only', () => {
      const validData: ChangeUsernameFormData = {
        username: 'testuser',
        confirmUsername: 'testuser',
      };

      const result = changeUsernameSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should accept username with numbers only', () => {
      const validData: ChangeUsernameFormData = {
        username: '123456',
        confirmUsername: '123456',
      };

      const result = changeUsernameSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should accept username with underscores', () => {
      const validData: ChangeUsernameFormData = {
        username: 'test_user',
        confirmUsername: 'test_user',
      };

      const result = changeUsernameSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should accept username with dashes', () => {
      const validData: ChangeUsernameFormData = {
        username: 'test-user',
        confirmUsername: 'test-user',
      };

      const result = changeUsernameSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should accept username at minimum length (2 characters)', () => {
      const validData: ChangeUsernameFormData = {
        username: 'ab',
        confirmUsername: 'ab',
      };

      const result = changeUsernameSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should accept username at maximum length (100 characters)', () => {
      const username = 'a'.repeat(100);
      const validData: ChangeUsernameFormData = {
        username,
        confirmUsername: username,
      };

      const result = changeUsernameSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should accept mixed alphanumeric with special characters', () => {
      const validData: ChangeUsernameFormData = {
        username: 'Test_User-123',
        confirmUsername: 'Test_User-123',
      };

      const result = changeUsernameSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });
  });

  describe('invalid data', () => {
    it('should reject mismatched usernames', () => {
      const invalidData = {
        username: 'firstusername',
        confirmUsername: 'secondusername',
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Usernames do not match');
        expect(result.error.issues[0].path).toEqual(['confirmUsername']);
      }
    });

    it('should reject username shorter than 2 characters', () => {
      const invalidData = {
        username: 'a',
        confirmUsername: 'a',
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path[0] === 'username')).toBe(true);
      }
    });

    it('should reject username longer than 100 characters', () => {
      const username = 'a'.repeat(101);
      const invalidData = {
        username,
        confirmUsername: username,
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path[0] === 'username')).toBe(true);
      }
    });

    it('should reject username with spaces', () => {
      const invalidData = {
        username: 'test user',
        confirmUsername: 'test user',
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid username. You can only use letters, numbers, underscores, and dashes.'
        );
      }
    });

    it('should reject username with special characters (other than dash and underscore)', () => {
      const invalidUsernames = [
        'test@user',
        'test#user',
        'test$user',
        'test%user',
        'test&user',
        'test*user',
        'test+user',
        'test=user',
        'test!user',
        'test.user',
        'test,user',
      ];

      invalidUsernames.forEach((username) => {
        const invalidData = {
          username,
          confirmUsername: username,
        };

        const result = changeUsernameSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(
            'Invalid username. You can only use letters, numbers, underscores, and dashes.'
          );
        }
      });
    });

    it('should require username field', () => {
      const invalidData = {
        confirmUsername: 'testuser',
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should require confirmUsername field', () => {
      const invalidData = {
        username: 'testuser',
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings in username fields', () => {
      const invalidData = {
        username: '',
        confirmUsername: '',
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should handle whitespace-only usernames', () => {
      const invalidData = {
        username: '   ',
        confirmUsername: '   ',
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should be case-sensitive for matching', () => {
      const invalidData = {
        username: 'TestUser',
        confirmUsername: 'testuser',
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Usernames do not match');
      }
    });

    it('should reject username with leading/trailing spaces', () => {
      const invalidData = {
        username: ' testuser ',
        confirmUsername: ' testuser ',
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject null values', () => {
      const invalidData = {
        username: null,
        confirmUsername: null,
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject undefined values', () => {
      const invalidData = {
        username: undefined,
        confirmUsername: undefined,
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should handle unicode characters', () => {
      const invalidData = {
        username: 'tëst-üser',
        confirmUsername: 'tëst-üser',
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid username. You can only use letters, numbers, underscores, and dashes.'
        );
      }
    });

    it('should handle emojis', () => {
      const invalidData = {
        username: 'test😀user',
        confirmUsername: 'test😀user',
      };

      const result = changeUsernameSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});
