/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import type { AttachmentKind, ReencodeFailure } from '@fakefour/job-contract';
import type { Readable } from 'node:stream';

// The web ↔ Lambda wire shapes live in `@fakefour/job-contract` (ADR-0026).
// Re-exported so the modules here import them from one place.
export {
  ATTACHMENT_CARD_WIDTH,
  ATTACHMENT_IMAGE_MAX_EDGE,
  ATTACHMENT_IMAGE_QUALITY,
  ATTACHMENT_MAX_AUDIO_SECONDS,
  ATTACHMENT_MAX_VIDEO_SECONDS,
  ATTACHMENT_VIDEO_SHORT_SIDE,
  attachmentUploadLimitBytes,
  submissionReencodeInputSchema,
  type AttachmentKind,
  type ReencodeFailure,
  type ReencodeProgressStage,
  type SubmissionReencodeData,
  type SubmissionReencodeInput,
  type SubmissionReencodeResult,
} from '@fakefour/job-contract';

/**
 * The minimum an event must carry for the Lambda to report back at all: the
 * completion URL and the per-job token.
 *
 * Parsed separately from `submissionReencodeInputSchema` on purpose. When the
 * full input parse fails there is no parsed output to read the callback details
 * from, and those are exactly the details needed to tell the web app that the
 * job is dead — otherwise it waits out the stale window.
 */
export const callbackTargetSchema = z.object({
  callbackUrl: z.string().url(),
  jobToken: z.string().min(1).max(200),
  signingKey: z.string().min(1).optional(),
});

/** A refusal with the code the web app maps to the copy an owner reads. */
export class ReencodeError extends Error {
  readonly failure: ReencodeFailure;

  constructor(failure: ReencodeFailure, detail: string) {
    super(detail);
    this.name = 'ReencodeError';
    this.failure = failure;
  }
}

/** An object opened for reading: its size is known before any of the body is read. */
export interface OpenedObject {
  /** The object's size in bytes, or `null` when the store did not say. */
  bytes: number | null;
  body: Readable;
}

/** One local file to store. */
export interface PutFileRequest {
  bucket: string;
  key: string;
  filePath: string;
  contentType: string;
  cacheControl: string;
}

/** The three things the Lambda does to the private bucket. */
export interface ObjectStore {
  open: (bucket: string, key: string) => Promise<OpenedObject>;
  putFile: (request: PutFileRequest) => Promise<void>;
  remove: (bucket: string, key: string) => Promise<void>;
}

/** The two binaries the Lambda runs. Never a path, never a caller's string. */
export type MediaBinary = 'ffmpeg' | 'ffprobe';

/** One run of ffmpeg or ffprobe. */
export interface ProcessRequest {
  binary: MediaBinary;
  /** The argument vector. There is no shell, so nothing in it is interpreted. */
  args: readonly string[];
  /** The run is killed once this many milliseconds have passed. */
  timeoutMs: number;
  /** The working directory: the run's own temp dir. */
  cwd: string;
  /** Receives stdout as it arrives; when set, stdout is not captured. */
  onStdout?: (text: string) => void;
}

/** How a run ended. A run never rejects. */
export interface ProcessResult {
  /** The exit code, or `null` when the process was killed or never started. */
  code: number | null;
  /** Captured stdout, bounded; empty when the request streamed it instead. */
  stdout: string;
  /** The end of stderr, bounded. */
  stderrTail: string;
  timedOut: boolean;
  /** Stdout ran past its bound and the process was killed. */
  overflowed: boolean;
}

export type RunProcess = (request: ProcessRequest) => Promise<ProcessResult>;

/** The run's private directory under `/tmp`. */
export interface Workspace {
  create: () => Promise<string>;
  remove: (dir: string) => Promise<void>;
}

/**
 * Everything the Lambda reaches outside its own process. Unit tests replace
 * all of it, so they need no AWS, no ffmpeg and no network.
 */
export interface ReencoderDeps {
  store: ObjectStore;
  runProcess: RunProcess;
  fetchFn: typeof fetch;
  /** Milliseconds since the epoch. */
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  workspace: Workspace;
}

/** A file a re-encode wrote, ready to store under the copy prefix. */
export interface WrittenFile {
  /** The file's name under the copy prefix, fixed by the wire contract. */
  name: 'copy.jpg' | 'copy.mp3' | 'copy.mp4' | 'card.webp' | 'poster.jpg';
  path: string;
  contentType: string;
}

/** What one re-encode wrote to the temp dir. */
export interface ReencodeOutput {
  /** What the file turned out to be. */
  kind: AttachmentKind;
  copy: WrittenFile;
  card: WrittenFile | null;
  poster: WrittenFile | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}
