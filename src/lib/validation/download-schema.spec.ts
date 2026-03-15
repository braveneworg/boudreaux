/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, it, expect } from 'vitest';

import downloadSchema, {
  DOWNLOAD_OPTIONS,
  type DownloadFormSchemaType,
} from '@/lib/validation/download-schema';

describe('download-schema', () => {
  const validFreeData: DownloadFormSchemaType = {
    downloadOption: 'free-320kbps',
    finalAmount: '',
  };

  const validPremiumData: DownloadFormSchemaType = {
    downloadOption: 'premium-digital',
    finalAmount: '',
  };

  describe('DOWNLOAD_OPTIONS', () => {
    it('should export exactly two options', () => {
      expect(DOWNLOAD_OPTIONS).toHaveLength(2);
    });

    it('should have value and label for each option', () => {
      for (const option of DOWNLOAD_OPTIONS) {
        expect(option).toHaveProperty('value');
        expect(option).toHaveProperty('label');
        expect(option.value.length).toBeGreaterThan(0);
        expect(option.label.length).toBeGreaterThan(0);
      }
    });

    it('should have unique values', () => {
      const values = DOWNLOAD_OPTIONS.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    });

    it('should include free-320kbps option', () => {
      const values = DOWNLOAD_OPTIONS.map((o) => o.value);
      expect(values).toContain('free-320kbps');
    });

    it('should include premium-digital option', () => {
      const values = DOWNLOAD_OPTIONS.map((o) => o.value);
      expect(values).toContain('premium-digital');
    });
  });

  describe('downloadOption field', () => {
    it('should accept free-320kbps', () => {
      const result = downloadSchema.safeParse(validFreeData);
      expect(result.success).toBe(true);
    });

    it('should accept premium-digital', () => {
      const result = downloadSchema.safeParse(validPremiumData);
      expect(result.success).toBe(true);
    });

    it('should reject an invalid option value', () => {
      const result = downloadSchema.safeParse({ ...validFreeData, downloadOption: 'invalid-type' });
      expect(result.success).toBe(false);
    });

    it('should reject when downloadOption is missing', () => {
      const { downloadOption: _, ...withoutOption } = validFreeData;
      const result = downloadSchema.safeParse(withoutOption);
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'downloadOption');
      expect(errors?.length).toBeGreaterThan(0);
    });

    it('should return the correct error message when missing', () => {
      const result = downloadSchema.safeParse({ finalAmount: '' });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'downloadOption');
      expect(errors?.[0].message).toBe('Please select a download option');
    });
  });

  describe('finalAmount field', () => {
    it('should accept an empty string', () => {
      const result = downloadSchema.safeParse({ ...validPremiumData, finalAmount: '' });
      expect(result.success).toBe(true);
    });

    it('should accept undefined (field is optional)', () => {
      const result = downloadSchema.safeParse({
        downloadOption: 'premium-digital',
        finalAmount: undefined,
      });
      expect(result.success).toBe(true);
    });

    it('should accept a valid positive number string', () => {
      const result = downloadSchema.safeParse({ ...validPremiumData, finalAmount: '5' });
      expect(result.success).toBe(true);
    });

    it('should accept a valid decimal number string', () => {
      const result = downloadSchema.safeParse({ ...validPremiumData, finalAmount: '2.50' });
      expect(result.success).toBe(true);
    });

    it('should accept zero', () => {
      const result = downloadSchema.safeParse({ ...validPremiumData, finalAmount: '0' });
      expect(result.success).toBe(true);
    });

    it('should accept a negative sign (stripped to positive number during sanitization)', () => {
      const result = downloadSchema.safeParse({ ...validPremiumData, finalAmount: '-5' });
      expect(result.success).toBe(true);
    });

    it('should accept a non-numeric string (stripped to empty during sanitization)', () => {
      const result = downloadSchema.safeParse({ ...validPremiumData, finalAmount: 'abc' });
      expect(result.success).toBe(true);
    });
  });

  describe('full form validation', () => {
    it('should accept complete free download data', () => {
      const result = downloadSchema.safeParse(validFreeData);
      expect(result.success).toBe(true);
      expect(result.data?.downloadOption).toBe('free-320kbps');
    });

    it('should accept premium data with a custom amount', () => {
      const result = downloadSchema.safeParse({
        downloadOption: 'premium-digital',
        finalAmount: '10',
      });
      expect(result.success).toBe(true);
      expect(result.data?.downloadOption).toBe('premium-digital');
      expect(result.data?.finalAmount).toBe('10');
    });

    it('should reject an empty object', () => {
      const result = downloadSchema.safeParse({});
      expect(result.success).toBe(false);
      const fieldNames = result.error?.issues.map((i) => i.path[0]);
      expect(fieldNames).toContain('downloadOption');
    });
  });

  describe('type inference', () => {
    it('should correctly infer types from parsed data', () => {
      const result = downloadSchema.safeParse(validFreeData);
      expect(result.success).toBe(true);
      const data = result.data as DownloadFormSchemaType;
      expect(typeof data.downloadOption).toBe('string');
    });
  });
});
