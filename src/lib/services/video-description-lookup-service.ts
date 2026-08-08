/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { z } from 'zod';

import { loggers } from '@/lib/utils/logger';

const logger = loggers.media;

/**
 * Longer than the release-date lookup's 25s: description synthesis adds a
 * review-targeted third search plus best-effort page reads for quote material.
 */
const INVOKE_REQUEST_TIMEOUT_MS = 60_000;

const lookupResultSchema = z.object({
  description: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.string()),
});

const lambdaEnvelopeSchema = z.union([
  z.object({ ok: z.literal(true), result: lookupResultSchema.nullable() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export type VideoDescriptionLookup = z.infer<typeof lookupResultSchema>;

/** Arguments for {@link VideoDescriptionLookupService.lookup}. */
export interface VideoDescriptionLookupArgs {
  title: string;
  artist: string;
  /** The admin-entered release date (YYYY-MM-DD), cited by the prose when set. */
  releasedOn?: string;
}

/**
 * Deterministic ~500-char fixture mirroring the real contract (artist named,
 * attributed quotes) so E2E and local dev exercise the full apply path.
 */
const fakeResult = ({ title, artist }: VideoDescriptionLookupArgs): VideoDescriptionLookup => ({
  description:
    `"${title}" is a single by ${artist}, released to steady acclaim across the ` +
    `independent underground. Critics framed the track as a distillation of ` +
    `${artist}'s restless songwriting — "a fearless collision of melody and ` +
    `confession" — Indie Sleeves — while touring versions sharpened its ` +
    `arrangement into the recording heard here. Press coverage singled out the ` +
    `closing verse as "the year's most quietly devastating minute" — Tape Deck ` +
    `Quarterly — cementing its place in ${artist}'s catalogue.`,
  confidence: 'medium',
  sources: ['https://example.com/reviews/fixture'],
});

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

export class VideoDescriptionLookupService {
  /**
   * Synthesize a ~500-character video description (artist named, verbatim
   * press quotes with inline attribution when the web offers them) via the
   * bio-generator Lambda's `video-description-lookup` task. Returns the parsed
   * result, or `null` when nothing was synthesized or the function name is not
   * configured. Throws when the Lambda payload reports `ok:false` — the route
   * maps that to 502.
   *
   * Fake path (`BIO_GENERATOR_FAKE=true`): returns a deterministic fixture
   * without invoking the Lambda, for use in E2E and local dev.
   */
  static async lookup(args: VideoDescriptionLookupArgs): Promise<VideoDescriptionLookup | null> {
    if (process.env.BIO_GENERATOR_FAKE === 'true') return fakeResult(args);

    const functionName = process.env.BIO_GENERATOR_LAMBDA_NAME;
    if (!functionName) {
      logger.warn('Description lookup skipped — BIO_GENERATOR_LAMBDA_NAME unset');
      return null;
    }

    const { title, artist, releasedOn } = args;
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(
        JSON.stringify({
          task: 'video-description-lookup',
          title,
          artist,
          ...(releasedOn ? { releasedOn } : {}),
        })
      ),
    });
    const response = await getLambdaClient().send(command);
    if (!response.Payload) throw new Error('Description lookup returned no payload');

    const parsed = lambdaEnvelopeSchema.parse(
      JSON.parse(Buffer.from(response.Payload).toString('utf-8'))
    );
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.result;
  }
}
