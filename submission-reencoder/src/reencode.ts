/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { join } from 'node:path';

import { submissionReencodeDataSchema } from '@fakefour/job-contract';

import { downloadUpload } from './download.js';
import { reencodeImage } from './image.js';
import { fileBytes } from './lib/files.js';
import { logEvent, toErrorMessage } from './lib/log.js';
import { reencodeMedia } from './media.js';
import { createProgressReporter } from './progress.js';
import { ReencodeError } from './types.js';

import type { ProgressReporter, ProgressTarget } from './progress.js';
import type {
  ReencodeFailure,
  ReencodeOutput,
  ReencoderDeps,
  SubmissionReencodeData,
  SubmissionReencodeInput,
  SubmissionReencodeResult,
  WrittenFile,
} from './types.js';

/**
 * How long a run may spend downloading, probing and encoding: 11 minutes. The
 * Lambda is killed at 900s and a killed run reports nothing, so the work stops
 * here and leaves four minutes for storing the files, deleting the upload and
 * a callback that may retry (at worst four 15s attempts and three 20s waits).
 */
const RUN_BUDGET_MS = 660_000;

/** Every file under a copy prefix is written once and never changed. */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * The upload's name in the temp dir. Chosen here, and without an extension:
 * what the file is gets decided by its content, never by a name.
 */
const UPLOAD_FILE_NAME = 'upload';

/** One run's temp dir, clock and progress channel. */
interface Run {
  dir: string;
  deadline: number;
  progress: ProgressReporter;
}

/** Where progress goes, or `null` when the event did not say. */
const progressTarget = ({
  progressUrl,
  jobToken,
  signingKey,
}: SubmissionReencodeInput): ProgressTarget | null =>
  progressUrl && jobToken ? { progressUrl, jobToken, signingKey } : null;

/** Re-encode the downloaded upload by the kind its type declared. */
const encode = async (
  input: SubmissionReencodeInput,
  inputPath: string,
  { dir, deadline, progress }: Run,
  deps: ReencoderDeps
): Promise<ReencodeOutput> => {
  if (input.kind === 'IMAGE') {
    await progress.stage('encoding');
    return reencodeImage(inputPath, dir);
  }
  return reencodeMedia({ inputPath, outDir: dir, declared: input.kind, deadline, progress }, deps);
};

/** What the callback will say was written, checked against the wire contract. */
const describeOutput = async (
  { copyPrefix }: SubmissionReencodeInput,
  output: ReencodeOutput
): Promise<SubmissionReencodeData> => {
  const keyOf = (file: WrittenFile | null): string | null =>
    file ? `${copyPrefix}${file.name}` : null;
  const data = submissionReencodeDataSchema.safeParse({
    kind: output.kind,
    copyKey: keyOf(output.copy),
    cardKey: keyOf(output.card),
    posterKey: keyOf(output.poster),
    copyBytes: await fileBytes(output.copy.path),
    width: output.width,
    height: output.height,
    durationSeconds: output.durationSeconds,
  });
  if (!data.success) {
    // The web app would refuse this callback and wait out the stale window.
    const issues = data.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`);
    throw new ReencodeError('failed', `the result breaks the wire contract: ${issues.join('; ')}`);
  }
  return data.data;
};

/** Store every written file under the copy prefix. */
const storeOutput = async (
  { bucket, copyPrefix }: SubmissionReencodeInput,
  output: ReencodeOutput,
  { store }: ReencoderDeps
): Promise<void> => {
  const files = [output.copy, output.card, output.poster].filter((file) => file !== null);
  await Promise.all(
    files.map(({ name, path, contentType }) =>
      store.putFile({
        bucket,
        key: `${copyPrefix}${name}`,
        filePath: path,
        contentType,
        cacheControl: CACHE_CONTROL,
      })
    )
  );
};

/** Download, re-encode and store one attachment. */
const produce = async (
  input: SubmissionReencodeInput,
  run: Run,
  deps: ReencoderDeps
): Promise<SubmissionReencodeData> => {
  const inputPath = join(run.dir, UPLOAD_FILE_NAME);
  await run.progress.stage('downloading');
  await downloadUpload(
    { bucket: input.bucket, key: input.uploadKey, kind: input.kind, destination: inputPath },
    deps.store
  );
  const output = await encode(input, inputPath, run, deps);
  const data = await describeOutput(input, output);
  await run.progress.stage('storing');
  await storeOutput(input, output, deps);

  return data;
};

/** The failure code an error stands for; anything unexpected is `failed`. */
const failureOf = (err: unknown, attachmentId: string): ReencodeFailure => {
  if (err instanceof ReencodeError) {
    logEvent('warn', 'reencode_refused', {
      attachmentId,
      failure: err.failure,
      detail: err.message,
    });
    return err.failure;
  }
  logEvent('warn', 'reencode_failed', { attachmentId, error: toErrorMessage(err) });
  return 'failed';
};

/**
 * Delete the upload and the temp dir, whichever way the run went (ADR-0026).
 * Neither can change the result: an upload that survives expires within a day
 * by the bucket's lifecycle rule.
 */
const cleanUp = async (
  { attachmentId, bucket, uploadKey }: SubmissionReencodeInput,
  dir: string | null,
  { store, workspace }: ReencoderDeps
): Promise<void> => {
  try {
    await store.remove(bucket, uploadKey);
  } catch (err) {
    logEvent('warn', 'reencode_upload_delete_failed', { attachmentId, error: toErrorMessage(err) });
  }
  if (dir === null) {
    return;
  }
  try {
    await workspace.remove(dir);
  } catch (err) {
    logEvent('warn', 'reencode_workspace_remove_failed', {
      attachmentId,
      error: toErrorMessage(err),
    });
  }
};

/**
 * Re-encode one attachment and answer the result envelope. Never throws: a
 * refusal or an unexpected error becomes `{ ok: false, error }` with one of
 * the contract's failure codes. The upload and the temp dir are gone by the
 * time this resolves.
 */
export const reencodeAttachment = async (
  input: SubmissionReencodeInput,
  deps: ReencoderDeps
): Promise<SubmissionReencodeResult> => {
  const progress = createProgressReporter(progressTarget(input), deps);
  const deadline = deps.now() + RUN_BUDGET_MS;
  let dir: string | null = null;
  try {
    dir = await deps.workspace.create();
    const data = await produce(input, { dir, deadline, progress }, deps);
    logEvent('info', 'reencode_complete', {
      attachmentId: input.attachmentId,
      kind: data.kind,
      copyBytes: data.copyBytes,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: failureOf(err, input.attachmentId) };
  } finally {
    await progress.settle();
    await cleanUp(input, dir, deps);
  }
};
