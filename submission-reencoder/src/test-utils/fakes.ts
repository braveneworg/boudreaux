/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

import { createWorkspace, fileSource, removeWorkspace } from '../lib/files.js';

import type {
  ObjectStore,
  ProcessResult,
  PutFileRequest,
  ReencoderDeps,
  RunProcess,
  SubmissionReencodeInput,
} from '../types.js';

/** Stand-ins for everything the Lambda reaches outside its own process. */

export const BUCKET = 'fakefour-submission-uploads-test';
export const SUBMISSION_ID = '65f0c0000000000000000001';
export const ATTACHMENT_ID = '65f0c0000000000000000002';
export const UPLOAD_KEY = `uploads/${SUBMISSION_ID}/3f1c2c5e-0000-4000-8000-000000000001`;
export const COPY_PREFIX = `copies/${SUBMISSION_ID}/${ATTACHMENT_ID}/`;
export const JOB_TOKEN = 'job-token-for-tests';
export const SIGNING_KEY = 'ef'.repeat(32);
export const CALLBACK_URL = `https://app.example/api/community/attachments/${ATTACHMENT_ID}/reencode/callback?trace=callback-query`;
export const PROGRESS_URL = `https://app.example/api/community/attachments/${ATTACHMENT_ID}/reencode/progress?trace=progress-query`;
export const START_MS = Date.parse('2026-11-11T12:00:00.000Z');

/** A valid invoke event, as the web app's job runner sends it. */
export const reencodeEvent = (
  overrides: Partial<SubmissionReencodeInput> = {}
): SubmissionReencodeInput => ({
  task: 'submission-reencode',
  attachmentId: ATTACHMENT_ID,
  kind: 'IMAGE',
  bucket: BUCKET,
  uploadKey: UPLOAD_KEY,
  copyPrefix: COPY_PREFIX,
  callbackUrl: CALLBACK_URL,
  progressUrl: PROGRESS_URL,
  jobToken: JOB_TOKEN,
  signingKey: SIGNING_KEY,
  ...overrides,
});

/** An in-memory bucket that records what was done to it. */
export interface FakeStore extends ObjectStore {
  /** Every object, by key. */
  objects: Map<string, Buffer>;
  /** Every `putFile` request, in order. */
  puts: PutFileRequest[];
  /** Every key `remove` was asked to delete, in order. */
  removed: string[];
  /** Every body `open` handed out, so a test can see whether it was read. */
  opened: Readable[];
}

export const createFakeStore = (seed: Record<string, Buffer> = {}): FakeStore => {
  const objects = new Map(Object.entries(seed));
  const puts: PutFileRequest[] = [];
  const removed: string[] = [];
  const opened: Readable[] = [];

  return {
    objects,
    puts,
    removed,
    opened,
    open: async (_bucket, key) => {
      const bytes = objects.get(key);
      if (!bytes) {
        throw new Error('NoSuchKey');
      }
      const body = Readable.from([bytes]);
      opened.push(body);
      return { bytes: bytes.length, body };
    },
    putFile: async (request) => {
      puts.push(request);
      objects.set(request.key, await buffer(fileSource(request.filePath)));
    },
    remove: async (_bucket, key) => {
      removed.push(key);
      objects.delete(key);
    },
  };
};

/** One recorded POST. */
export interface RecordedPost {
  url: string;
  headers: Record<string, string>;
  rawBody: string;
  body: Record<string, unknown>;
}

/** A fetch that records every POST and answers 200. */
export const createFakeFetch = (): { fetchFn: typeof fetch; posts: RecordedPost[] } => {
  const posts: RecordedPost[] = [];
  const fetchFn = (async (url: string, init: RequestInit): Promise<Response> => {
    const rawBody = String(init.body);
    posts.push({
      url,
      headers: init.headers as Record<string, string>,
      rawBody,
      body: JSON.parse(rawBody) as Record<string, unknown>,
    });
    return new Response('ok', { status: 200 });
  }) as typeof fetch;

  return { fetchFn, posts };
};

/** Fake deps over real temp dirs, with handles on everything they recorded. */
export interface FakeDeps {
  deps: ReencoderDeps;
  store: FakeStore;
  posts: RecordedPost[];
  /** Every temp dir the run made. */
  workspaces: string[];
  /** Every temp dir the run removed. */
  removedWorkspaces: string[];
  clock: { nowMs: number };
}

/** A process runner for runs that must not start a process. */
export const noProcess: RunProcess = async (): Promise<ProcessResult> => ({
  code: null,
  stdout: '',
  stderrTail: 'no process expected',
  timedOut: false,
  overflowed: false,
});

export const createFakeDeps = (
  seed: Record<string, Buffer> = {},
  runProcess: RunProcess = noProcess
): FakeDeps => {
  const store = createFakeStore(seed);
  const { fetchFn, posts } = createFakeFetch();
  const workspaces: string[] = [];
  const removedWorkspaces: string[] = [];
  const clock = { nowMs: START_MS };

  return {
    store,
    posts,
    workspaces,
    removedWorkspaces,
    clock,
    deps: {
      store,
      runProcess,
      fetchFn,
      now: () => clock.nowMs,
      sleep: async (ms) => {
        clock.nowMs += ms;
      },
      workspace: {
        create: async () => {
          const dir = await createWorkspace();
          workspaces.push(dir);
          return dir;
        },
        remove: async (dir) => {
          removedWorkspaces.push(dir);
          await removeWorkspace(dir);
        },
      },
    },
  };
};
