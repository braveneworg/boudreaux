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
 * Matches the video description lookup's budget: several searches plus
 * best-effort page reads, then a single-blurb synthesis.
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

export type ReleaseDescriptionLookup = z.infer<typeof lookupResultSchema>;

/** Arguments for {@link ReleaseDescriptionLookupService.lookup}. */
export interface ReleaseDescriptionLookupArgs {
  title: string;
  artist: string;
  /** The admin-entered release date (YYYY-MM-DD), cited by the prose when set. */
  releasedOn?: string;
  catalogNumber?: string;
  /** `Format` enum values; humanized inside the Lambda prompt. */
  formats?: string[];
  /**
   * The label's own authored release notes. Authoritative grounding for the
   * blurb, and the seed for an extra corroborating web search.
   */
  labelNotes?: string[];
}

/**
 * Deterministic ~500-char fixture mirroring the real contract (artist named,
 * attributed quote) so E2E and local dev exercise the full apply path. When
 * the label supplied notes, the fixture leads with them the way the real
 * prompt does.
 */
const fakeResult = ({
  title,
  artist,
  labelNotes,
}: ReleaseDescriptionLookupArgs): ReleaseDescriptionLookup => {
  const labelLead = labelNotes?.[0] ? `${labelNotes[0].replace(/\.$/, '')}. ` : '';
  return {
    description:
      `${labelLead}"${title}" is the record ${artist} built out of a restless year ` +
      `on the road, tracked between tours and mixed in a single sitting. Its songs ` +
      `move from spoken-word confession to full-band catharsis without ever losing ` +
      `the thread, and the arrangements stay deliberately unpolished throughout. ` +
      `Press coverage singled out the sequencing — "a record that refuses to sit ` +
      `still" — Tape Deck Quarterly — and the album has stayed a touchstone in ` +
      `${artist}'s catalogue ever since.`,
    confidence: 'medium',
    sources: ['https://example.com/reviews/fixture'],
  };
};

/**
 * The Lambda task payload: the required identity plus whichever optional
 * facts the admin has actually filled in.
 */
const buildTaskPayload = ({
  title,
  artist,
  releasedOn,
  catalogNumber,
  formats,
  labelNotes,
}: ReleaseDescriptionLookupArgs): Record<string, unknown> => ({
  task: 'release-description-lookup',
  title,
  artist,
  ...(releasedOn ? { releasedOn } : {}),
  ...(catalogNumber ? { catalogNumber } : {}),
  ...(formats && formats.length > 0 ? { formats } : {}),
  ...(labelNotes && labelNotes.length > 0 ? { labelNotes } : {}),
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

export class ReleaseDescriptionLookupService {
  /**
   * Synthesize the short listing blurb — ~500 characters naming the artist,
   * built from the label's own notes plus web evidence, with verbatim press
   * quotes attributed inline when the web offers them — via the bio-generator
   * Lambda's `release-description-lookup` task. Returns the parsed result, or
   * `null` when nothing was synthesized or the function name is not
   * configured. Throws when the Lambda payload reports `ok:false` — the route
   * maps that to 502.
   *
   * Fake path (`BIO_GENERATOR_FAKE=true`): returns a deterministic fixture
   * without invoking the Lambda, for use in E2E and local dev.
   */
  static async lookup(
    args: ReleaseDescriptionLookupArgs
  ): Promise<ReleaseDescriptionLookup | null> {
    if (process.env.BIO_GENERATOR_FAKE === 'true') return fakeResult(args);

    const functionName = process.env.BIO_GENERATOR_LAMBDA_NAME;
    if (!functionName) {
      logger.warn('Release description lookup skipped — BIO_GENERATOR_LAMBDA_NAME unset');
      return null;
    }

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(buildTaskPayload(args))),
    });
    const response = await getLambdaClient().send(command);
    if (!response.Payload) throw new Error('Release description lookup returned no payload');

    const parsed = lambdaEnvelopeSchema.parse(
      JSON.parse(Buffer.from(response.Payload).toString('utf-8'))
    );
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.result;
  }
}
