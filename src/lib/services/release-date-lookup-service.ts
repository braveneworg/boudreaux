/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { z } from 'zod';

import { loggers } from '@/lib/utils/logger';

const logger = loggers.media;
const INVOKE_REQUEST_TIMEOUT_MS = 25_000;

const lookupResultSchema = z.object({
  releasedOn: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.string()),
});

const lambdaEnvelopeSchema = z.union([
  z.object({ ok: z.literal(true), result: lookupResultSchema.nullable() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export type ReleaseDateLookup = z.infer<typeof lookupResultSchema>;

const FAKE_RESULT: ReleaseDateLookup = {
  releasedOn: '2020-06-01',
  confidence: 'medium',
  sources: ['https://musicbrainz.org/'],
};

let lambdaClient: LambdaClient | null = null;

const getLambdaClient = (): LambdaClient => {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      requestHandler: new NodeHttpHandler({ requestTimeout: INVOKE_REQUEST_TIMEOUT_MS }),
    });
  }
  return lambdaClient;
};

export class ReleaseDateLookupService {
  /**
   * Look up a release date from the web via the bio-generator Lambda's
   * `release-date-lookup` task. Returns the parsed result, or `null` when
   * nothing was found or the function name is not configured. Throws when the
   * Lambda payload reports `ok:false` — the route maps that to 502.
   *
   * Fake path (`BIO_GENERATOR_FAKE=true`): returns a deterministic fixture
   * without invoking the Lambda, for use in E2E and local dev.
   */
  static async lookup(title: string, artist?: string): Promise<ReleaseDateLookup | null> {
    if (process.env.BIO_GENERATOR_FAKE === 'true') return FAKE_RESULT;

    const functionName = process.env.BIO_GENERATOR_LAMBDA_NAME;
    if (!functionName) {
      logger.warn('Release date lookup skipped — BIO_GENERATOR_LAMBDA_NAME unset');
      return null;
    }

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify({ task: 'release-date-lookup', title, artist })),
    });
    const response = await getLambdaClient().send(command);
    if (!response.Payload) throw new Error('Release date lookup returned no payload');

    const parsed = lambdaEnvelopeSchema.parse(
      JSON.parse(Buffer.from(response.Payload).toString('utf-8'))
    );
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.result;
  }
}
