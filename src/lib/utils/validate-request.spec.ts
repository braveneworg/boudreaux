// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { validateBody } from './validate-request';

describe('validateBody', () => {
  const testSchema = z.object({
    name: z.string().min(1, { message: 'Name is required' }),
    age: z.number().int().min(0),
    email: z.string().email().optional(),
  });

  describe('successful validation', () => {
    it('should return success with parsed data for valid input', () => {
      const body = { name: 'Alice', age: 30 };
      const result = validateBody(testSchema, body);

      expect(result.success).toBe(true);
      expect('data' in result && result.data).toEqual({ name: 'Alice', age: 30 });
    });

    it('should include optional fields when provided', () => {
      const body = { name: 'Bob', age: 25, email: 'bob@example.com' };
      const result = validateBody(testSchema, body);

      expect(result.success).toBe(true);
      expect('data' in result && result.data).toEqual({
        name: 'Bob',
        age: 25,
        email: 'bob@example.com',
      });
    });

    it('should strip unknown fields from input', () => {
      const body = { name: 'Charlie', age: 40, unknownField: 'extra' };
      const result = validateBody(testSchema, body);

      expect(result.success).toBe(true);
      expect('data' in result && result.data).toEqual({ name: 'Charlie', age: 40 });
      expect('data' in result && result.data).not.toHaveProperty('unknownField');
    });

    it('should coerce valid types when schema allows it', () => {
      const coerceSchema = z.object({ count: z.coerce.number() });
      const result = validateBody(coerceSchema, { count: '42' });

      expect(result.success).toBe(true);
      expect('data' in result && result.data).toEqual({ count: 42 });
    });
  });

  describe('failed validation', () => {
    it('should return failure with 400 response for missing required fields', async () => {
      const body = { age: 30 };
      const result = validateBody(testSchema, body);

      expect(result.success).toBe(false);
      expect('response' in result).toBe(true);

      const response = (result as { success: false; response: Response }).response;
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Validation failed');
      expect(json.details).toBeDefined();
      expect(Array.isArray(json.details)).toBe(true);
      expect(json.details.length).toBeGreaterThan(0);
    });

    it('should return failure when field violates constraint', async () => {
      const body = { name: '', age: 30 };
      const result = validateBody(testSchema, body);

      expect(result.success).toBe(false);

      const response = (result as { success: false; response: Response }).response;
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Validation failed');
      expect(json.details).toBeDefined();
    });

    it('should return failure when field has wrong type', async () => {
      const body = { name: 'Alice', age: 'not-a-number' };
      const result = validateBody(testSchema, body);

      expect(result.success).toBe(false);

      const response = (result as { success: false; response: Response }).response;
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Validation failed');
    });

    it('should return failure when optional field has invalid format', async () => {
      const body = { name: 'Alice', age: 30, email: 'not-an-email' };
      const result = validateBody(testSchema, body);

      expect(result.success).toBe(false);

      const response = (result as { success: false; response: Response }).response;
      const json = await response.json();
      expect(json.error).toBe('Validation failed');
      expect(json.details.length).toBeGreaterThan(0);
    });

    it('should return failure with multiple issues for multiple errors', async () => {
      const body = { name: '', age: -1, email: 'bad' };
      const result = validateBody(testSchema, body);

      expect(result.success).toBe(false);

      const response = (result as { success: false; response: Response }).response;
      const json = await response.json();
      expect(json.details.length).toBeGreaterThanOrEqual(2);
    });

    it('should return failure for completely empty body', async () => {
      const result = validateBody(testSchema, {});

      expect(result.success).toBe(false);

      const response = (result as { success: false; response: Response }).response;
      expect(response.status).toBe(400);
    });

    it('should return failure for null body', async () => {
      const result = validateBody(testSchema, null);

      expect(result.success).toBe(false);

      const response = (result as { success: false; response: Response }).response;
      expect(response.status).toBe(400);
    });

    it('should return failure for undefined body', async () => {
      const result = validateBody(testSchema, undefined);

      expect(result.success).toBe(false);

      const response = (result as { success: false; response: Response }).response;
      expect(response.status).toBe(400);
    });

    it('should hide Zod error details in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const body = { age: 30 };
      const result = validateBody(testSchema, body);

      expect(result.success).toBe(false);

      const response = (result as { success: false; response: Response }).response;
      const json = await response.json();
      expect(json.error).toBe('Validation failed');
      expect(json.details).toBeUndefined();

      vi.unstubAllEnvs();
    });
  });

  describe('schema types', () => {
    it('should work with a simple string schema', () => {
      const stringSchema = z.string().min(1);
      const result = validateBody(stringSchema, 'hello');

      expect(result.success).toBe(true);
      expect('data' in result && result.data).toBe('hello');
    });

    it('should work with an array schema', () => {
      const arraySchema = z.array(z.string());
      const result = validateBody(arraySchema, ['a', 'b', 'c']);

      expect(result.success).toBe(true);
      expect('data' in result && result.data).toEqual(['a', 'b', 'c']);
    });

    it('should work with a partial schema', () => {
      const partialSchema = testSchema.partial();
      const result = validateBody(partialSchema, { name: 'Alice' });

      expect(result.success).toBe(true);
      expect('data' in result && result.data).toEqual({ name: 'Alice' });
    });

    it('should work with a schema with defaults', () => {
      const defaultSchema = z.object({
        name: z.string(),
        active: z.boolean().default(true),
      });
      const result = validateBody(defaultSchema, { name: 'Test' });

      expect(result.success).toBe(true);
      expect('data' in result && result.data).toEqual({ name: 'Test', active: true });
    });
  });
});
