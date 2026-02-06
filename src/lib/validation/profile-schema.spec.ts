import profileSchema, { type ProfileFormData } from './profile-schema';

describe('profile-schema', () => {
  describe('valid data', () => {
    it('should validate correct profile data', () => {
      const validData: ProfileFormData = {
        firstName: 'John',
        lastName: 'Doe',
        phone: '(555) 123-4567',
      };

      const result = profileSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate data without phone number', () => {
      const validData: ProfileFormData = {
        firstName: 'John',
        lastName: 'Doe',
        phone: '',
      };

      const result = profileSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate various phone number formats', () => {
      const phoneFormats = [
        '555-123-4567',
        '(555) 123-4567',
        '555.123.4567',
        '5551234567',
        '+1 555 123 4567',
        '1-555-123-4567',
      ];

      phoneFormats.forEach((phone) => {
        const data: ProfileFormData = {
          firstName: 'John',
          lastName: 'Doe',
          phone,
        };

        const result = profileSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });

    it('should validate complete profile data with address', () => {
      const validData: ProfileFormData = {
        firstName: 'John',
        lastName: 'Doe',
        phone: '(555) 123-4567',
        addressLine1: '123 Main Street',
        addressLine2: 'Apt 4B',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
      };

      const result = profileSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate various ZIP code formats', () => {
      const zipCodeFormats = [
        '12345', // US 5-digit
        '12345-6789', // US 9-digit
        'A1A 1A1', // Canadian with space
        'A1A1A1', // Canadian without space
      ];

      zipCodeFormats.forEach((zipCode) => {
        const data: ProfileFormData = {
          firstName: 'John',
          lastName: 'Doe',
          zipCode,
        };

        const result = profileSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });

    it('should validate partial address information', () => {
      const validData: ProfileFormData = {
        firstName: 'John',
        lastName: 'Doe',
        city: 'New York',
        state: 'NY',
        // No address lines or zip code
      };

      const result = profileSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate data without firstName and lastName', () => {
      const validData: ProfileFormData = {
        phone: '555-123-4567',
        city: 'New York',
      };

      const result = profileSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate completely empty data', () => {
      const validData: ProfileFormData = {};

      const result = profileSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid data', () => {
    it('should accept empty first name', () => {
      const data = {
        firstName: '',
        lastName: 'Doe',
        phone: '555-123-4567',
      };

      const result = profileSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept empty last name', () => {
      const data = {
        firstName: 'John',
        lastName: '',
        phone: '555-123-4567',
      };

      const result = profileSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject first name that is too long', () => {
      const invalidData = {
        firstName: 'a'.repeat(51),
        lastName: 'Doe',
        phone: '555-123-4567',
      };

      const result = profileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(
        (result as { success: false; error: { issues: Array<{ message: string }> } }).error
          .issues[0].message
      ).toBe('First name must be less than 50 characters');
    });

    it('should reject last name that is too long', () => {
      const invalidData = {
        firstName: 'John',
        lastName: 'a'.repeat(51),
        phone: '555-123-4567',
      };

      const result = profileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(
        (result as { success: false; error: { issues: Array<{ message: string }> } }).error
          .issues[0].message
      ).toBe('Last name must be less than 50 characters');
    });

    it('should reject invalid phone number formats', () => {
      const invalidPhoneFormats = [
        '123',
        'abc-def-ghij',
        '555-123',
        '555-123-456-789',
        'not-a-phone-number',
      ];

      invalidPhoneFormats.forEach((phone) => {
        const data = {
          firstName: 'John',
          lastName: 'Doe',
          phone,
        };

        const result = profileSchema.safeParse(data);
        expect(result.success).toBe(false);
        expect(
          (result as { success: false; error: { issues: Array<{ message: string }> } }).error
            .issues[0].message
        ).toBe('Please enter a valid phone number');
      });
    });

    it('should reject address lines that are too long', () => {
      const invalidData = {
        firstName: 'John',
        lastName: 'Doe',
        addressLine1: 'a'.repeat(101), // Too long
      };

      const result = profileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(
        (result as { success: false; error: { issues: Array<{ message: string }> } }).error
          .issues[0].message
      ).toBe('Address must be less than 100 characters');
    });

    it('should reject cities that are too long', () => {
      const invalidData = {
        firstName: 'John',
        lastName: 'Doe',
        city: 'a'.repeat(51), // Too long
      };

      const result = profileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(
        (result as { success: false; error: { issues: Array<{ message: string }> } }).error
          .issues[0].message
      ).toBe('City must be less than 50 characters');
    });

    it('should reject invalid ZIP code formats', () => {
      const invalidZipFormats = [
        '1234', // Too short
        '123456', // Too long for 5-digit
        '12345-678', // Invalid 9-digit format
        'ABCDEF', // Invalid letters only
        '123AB', // Mixed invalid format
      ];

      invalidZipFormats.forEach((zipCode) => {
        const data = {
          firstName: 'John',
          lastName: 'Doe',
          zipCode,
        };

        const result = profileSchema.safeParse(data);
        expect(result.success).toBe(false);
        expect(
          (result as { success: false; error: { issues: Array<{ message: string }> } }).error
            .issues[0].message
        ).toBe('Please enter a valid ZIP code (12345 or 12345-6789) or postal code (A1A 1A1)');
      });
    });

    describe('country validation', () => {
      it('should accept valid country codes', () => {
        const validCountries = ['US', 'CA', 'GB', 'FR', 'DE'];

        validCountries.forEach((country) => {
          const data: ProfileFormData = {
            firstName: 'John',
            lastName: 'Doe',
            country,
          };

          const result = profileSchema.safeParse(data);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid country codes', () => {
        const invalidCountries = ['XX', 'ZZ', 'INVALID', 'USA', '123'];

        invalidCountries.forEach((country) => {
          const data: ProfileFormData = {
            firstName: 'John',
            lastName: 'Doe',
            country,
          };

          const result = profileSchema.safeParse(data);
          expect(result.success).toBe(false);
          expect(
            (result as { success: false; error: { issues: Array<{ message: string }> } }).error
              .issues[0].message
          ).toBe('Please select a valid country');
        });
      });

      it('should allow empty country', () => {
        const data: ProfileFormData = {
          firstName: 'John',
          lastName: 'Doe',
          country: '',
        };

        const result = profileSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('should allow undefined country', () => {
        const data: ProfileFormData = {
          firstName: 'John',
          lastName: 'Doe',
        };

        const result = profileSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });

    describe('allowSmsNotifications validation', () => {
      it('should accept true value', () => {
        const data: ProfileFormData = {
          firstName: 'John',
          lastName: 'Doe',
          allowSmsNotifications: true,
        };

        const result = profileSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('should accept false value', () => {
        const data: ProfileFormData = {
          firstName: 'John',
          lastName: 'Doe',
          allowSmsNotifications: false,
        };

        const result = profileSchema.safeParse(data);
        expect(result.success).toBe(true);
      });

      it('should allow undefined allowSmsNotifications', () => {
        const data: ProfileFormData = {
          firstName: 'John',
          lastName: 'Doe',
        };

        const result = profileSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });
  });
});
