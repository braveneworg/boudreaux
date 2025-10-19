import { COUNTRIES, getCountryName, getDefaultCountry } from './countries';

describe('countries utility', () => {
  describe('COUNTRIES constant', () => {
    it('should be an array of country objects', () => {
      expect(Array.isArray(COUNTRIES)).toBe(true);
      expect(COUNTRIES.length).toBeGreaterThan(0);
    });

    it('should have valid country objects with code and name', () => {
      COUNTRIES.forEach((country) => {
        expect(country).toHaveProperty('code');
        expect(country).toHaveProperty('name');
        expect(typeof country.code).toBe('string');
        expect(typeof country.name).toBe('string');
        expect(country.code.length).toBe(2); // ISO country codes are 2 characters
      });
    });

    it('should include common countries', () => {
      const countryCodes = COUNTRIES.map((c) => c.code);
      expect(countryCodes).toContain('US'); // United States
      expect(countryCodes).toContain('CA'); // Canada
      expect(countryCodes).toContain('GB'); // United Kingdom
      expect(countryCodes).toContain('FR'); // France
      expect(countryCodes).toContain('DE'); // Germany
      expect(countryCodes).toContain('JP'); // Japan
    });
  });

  describe('getCountryName', () => {
    it('should return country name for valid code', () => {
      expect(getCountryName('US')).toBe('United States');
      expect(getCountryName('CA')).toBe('Canada');
      expect(getCountryName('GB')).toBe('United Kingdom');
    });

    it('should return the code itself for invalid code', () => {
      expect(getCountryName('XX')).toBe('XX');
      expect(getCountryName('INVALID')).toBe('INVALID');
    });

    it('should handle empty string', () => {
      expect(getCountryName('')).toBe('');
    });
  });

  describe('getDefaultCountry', () => {
    it('should return US as default country', () => {
      expect(getDefaultCountry()).toBe('US');
    });
  });
});
