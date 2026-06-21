/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({});

/** Cached once per cold start — the Gemini key does not change between invokes. */
let cachedGeminiApiKey: string | null = null;

/** Cached once per cold start — the optional Jina (web scrape) key. */
let cachedScrapeApiKey: string | null = null;

const fetchSsmParameter = async (path: string): Promise<string> => {
  const command = new GetParameterCommand({ Name: path, WithDecryption: true });
  const result = await ssmClient.send(command);
  const value = result.Parameter?.Value;

  if (!value) {
    throw new Error(`SSM parameter ${path} returned no value`);
  }

  return value;
};

/**
 * Resolves the Gemini API key from SSM Parameter Store, caching it for the life
 * of the Lambda container. The SSM path is passed as a non-secret environment
 * variable so template.yaml stays the single source of truth for the name.
 *
 * @returns The decrypted Gemini API key.
 */
export const getGeminiApiKey = async (): Promise<string> => {
  if (cachedGeminiApiKey) {
    return cachedGeminiApiKey;
  }

  const path = process.env.SSM_PATH_GEMINI_API_KEY;
  if (!path) {
    throw new Error('Missing environment variable: SSM_PATH_GEMINI_API_KEY');
  }

  cachedGeminiApiKey = await fetchSsmParameter(path);
  return cachedGeminiApiKey;
};

/**
 * Resolves the optional web-scrape (Jina) API key from SSM. Unlike the Gemini
 * key this is non-fatal: Jina works keyless at a lower rate limit, so when
 * `SSM_PATH_JINA_API_KEY` is unset (or the lookup fails) it returns `null` and
 * scraping proceeds without authentication.
 *
 * @returns The decrypted key, or `null` when no key is configured.
 */
export const getScrapeApiKey = async (): Promise<string | null> => {
  if (cachedScrapeApiKey) {
    return cachedScrapeApiKey;
  }

  const path = process.env.SSM_PATH_JINA_API_KEY;
  if (!path) {
    return null;
  }

  try {
    cachedScrapeApiKey = await fetchSsmParameter(path);
    return cachedScrapeApiKey;
  } catch (err) {
    console.warn('Jina API key unavailable; scraping unauthenticated:', err);
    return null;
  }
};

/** Test-only reset of the cold-start cache. */
export const __resetSecretsCacheForTests = (): void => {
  cachedGeminiApiKey = null;
  cachedScrapeApiKey = null;
};
