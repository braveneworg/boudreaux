/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({});

/** Cached once per cold start — the Groq key does not change between invokes. */
let cachedGroqApiKey: string | null = null;

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
 * Resolves the Groq API key from SSM Parameter Store, caching it for the life
 * of the Lambda container. The SSM path is passed as a non-secret environment
 * variable so template.yaml stays the single source of truth for the name.
 *
 * @returns The decrypted Groq API key.
 */
export const getGroqApiKey = async (): Promise<string> => {
  if (cachedGroqApiKey) {
    return cachedGroqApiKey;
  }

  const path = process.env.SSM_PATH_GROQ_API_KEY;
  if (!path) {
    throw new Error('Missing environment variable: SSM_PATH_GROQ_API_KEY');
  }

  cachedGroqApiKey = await fetchSsmParameter(path);
  return cachedGroqApiKey;
};

/** Test-only reset of the cold-start cache. */
export const __resetSecretsCacheForTests = (): void => {
  cachedGroqApiKey = null;
};
