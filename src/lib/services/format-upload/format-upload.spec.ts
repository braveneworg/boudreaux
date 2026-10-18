/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import NodeID3 from 'node-id3';

import { ArtistService } from '@/lib/services/artist-service';
import { ReleaseService } from '@/lib/services/release-service';
import { DataError } from '@/lib/types/domain/errors';
import { loggers } from '@/lib/utils/logger';

import { localFormatObjectStore, readLocalFormatObject } from './format-object-store';
import { FormatUpload } from './format-upload';

import type { ConfirmFile, ConfirmInput, FormatObjectStore, ReceiveInput } from './types';

vi.mock('server-only', () => ({}));

const formatRepository = vi.hoisted(() => ({
  create: vi.fn(),
  replaceTracks: vi.fn(),
  findReferencedS3Keys: vi.fn(),
}));

vi.mock('@/lib/repositories/release-digital-format-repository', () => ({
  ReleaseDigitalFormatRepository: class {
    create = formatRepository.create;
    replaceTracks = formatRepository.replaceTracks;
    findReferencedS3Keys = formatRepository.findReferencedS3Keys;
  },
}));

vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    findByTitleInsensitive: vi.fn(),
    findTitleById: vi.fn(),
    createRelease: vi.fn(),
  },
}));

vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: { findOrCreateByName: vi.fn(), creditOnRelease: vi.fn() },
}));

const RELEASE_ID = '507f1f77bcf86cd799439011';
const PREFIX = `releases/${RELEASE_ID}/digital-formats/FLAC/`;
const MP3_FIXTURE = join(process.cwd(), 'public/e2e/audio/e2e-track-320.mp3');
const TAKEN_COPY =
  'A release titled "Taken Title" already exists. Open it from Releases to upload its formats.';

/** Keys a row references, as `findReferencedS3Keys` answers them. */
let referenced = new Set<string>();
let tempDir = '';
let upload: FormatUpload;

/** A key under the FLAC prefix, unique to the test (the local store outlives a test). */
const keyFor = (name: string): string => `${PREFIX}${randomUUID()}-${name}`;

const streamOf = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

/** Put an object into the local store, as a receive would have. */
const seed = async (...keys: string[]): Promise<void> => {
  const filePath = join(tempDir, `seed-${randomUUID()}`);
  await writeFile(filePath, 'bytes');
  for (const s3Key of keys) {
    await localFormatObjectStore.put({
      s3Key,
      filePath,
      contentType: 'audio/flac',
      contentLength: 5,
      signal: new AbortController().signal,
    });
  }
  await unlink(filePath);
};

const isStored = (s3Key: string): boolean => readLocalFormatObject(s3Key) !== null;

const wavInput = (overrides: Partial<ReceiveInput> = {}): ReceiveInput => ({
  releaseId: RELEASE_ID,
  formatType: 'WAV',
  fileName: 'take.wav',
  fileSize: 4,
  mimeType: 'audio/wav',
  body: streamOf(new Uint8Array([82, 73, 70, 70])),
  signal: new AbortController().signal,
  ...overrides,
});

const fileOf = (s3Key: string, overrides: Partial<ConfirmFile> = {}): ConfirmFile => ({
  s3Key,
  fileName: 'track.flac',
  fileSize: 100,
  mimeType: 'audio/flac',
  ...overrides,
});

const confirmInput = (
  files: ConfirmFile[],
  overrides: Partial<ConfirmInput> = {}
): ConfirmInput => ({
  releaseId: RELEASE_ID,
  formatType: 'FLAC',
  files,
  userId: 'admin-1',
  ...overrides,
});

const NEW_RELEASE = { album: 'New Album', year: 2020, label: ' Fake Four ' };

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'format-upload-'));
  upload = new FormatUpload({ store: localFormatObjectStore, tempDir });
  referenced = new Set();
  vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'https://example.com');
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://fallback.example.com');
  formatRepository.findReferencedS3Keys.mockImplementation(async (keys: string[]) =>
    keys.filter((key) => referenced.has(key))
  );
  formatRepository.create.mockResolvedValue({ id: 'format-1' });
  formatRepository.replaceTracks.mockImplementation(
    async (_releaseId: string, _formatType: string, files: unknown[]) => ({
      formatId: 'format-1',
      fileCount: files.length,
      replacedKeys: [],
    })
  );
  vi.mocked(ReleaseService.findTitleById).mockResolvedValue({
    id: RELEASE_ID,
    title: 'Own Release',
  });
  vi.mocked(ReleaseService.findByTitleInsensitive).mockResolvedValue(null);
  vi.mocked(ReleaseService.createRelease).mockImplementation(async (data) => ({
    success: true,
    data: { id: data.id, title: data.title } as never,
  }));
  vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
    success: true,
    data: { id: 'artist-1', displayName: null, firstName: 'Some', surname: 'Artist' },
  });
  vi.mocked(ArtistService.creditOnRelease).mockResolvedValue(undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tempDir, { recursive: true, force: true });
});

describe('FormatUpload.receive', () => {
  it('(a) stores the file under the key shape, and a stored MP3 carries the Visit comment', async () => {
    const bytes = await readFile(MP3_FIXTURE);

    const result = await upload.receive({
      releaseId: RELEASE_ID,
      formatType: 'MP3_320KBPS',
      fileName: 'My Track (1).mp3',
      fileSize: bytes.byteLength,
      mimeType: 'audio/mpeg',
      body: streamOf(bytes),
      signal: new AbortController().signal,
    });

    expect(result.success && result.data.s3Key).toMatch(
      /^releases\/507f1f77bcf86cd799439011\/digital-formats\/MP3_320KBPS\/\d+-My-Track--1-\.mp3$/
    );
    const stored = readLocalFormatObject(result.success ? result.data.s3Key : '');
    expect(stored?.contentType).toBe('audio/mpeg');
    expect(NodeID3.read(stored?.body ?? Buffer.alloc(0)).comment?.text).toBe(
      'Visit https://example.com/'
    );
  });

  it('writes the comment with NEXT_PUBLIC_BASE_URL when NEXT_PUBLIC_HOST_NAME is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', undefined);
    const bytes = await readFile(MP3_FIXTURE);

    const result = await upload.receive({
      ...wavInput(),
      formatType: 'MP3_320KBPS',
      fileName: 'track.mp3',
      fileSize: bytes.byteLength,
      mimeType: 'audio/mpeg',
      body: streamOf(bytes),
    });

    const stored = readLocalFormatObject(result.success ? result.data.s3Key : '');
    expect(NodeID3.read(stored?.body ?? Buffer.alloc(0)).comment?.text).toBe(
      'Visit https://fallback.example.com/'
    );
  });

  it('stores a format without a comment tag (WAV) byte for byte', async () => {
    const result = await upload.receive(wavInput());

    expect(result).toEqual({
      success: true,
      data: { s3Key: expect.stringMatching(/\/WAV\/\d+-take\.wav$/), contentType: 'audio/wav' },
    });
    const stored = readLocalFormatObject(result.success ? result.data.s3Key : '');
    expect(stored?.body).toEqual(Buffer.from([82, 73, 70, 70]));
  });

  it.each([
    ['an empty file name', { fileName: ' ' }, 'File name is required'],
    ['a size of zero', { fileSize: 0 }, 'File size must be positive'],
    [
      'a size over the limit',
      { fileSize: 301 * 1024 * 1024 },
      'File size exceeds 300 MB limit for WAV',
    ],
    [
      'a MIME type the format does not take',
      { mimeType: 'audio/mpeg' },
      'Invalid MIME type. Expected: audio/wav, audio/x-wav, audio/wave',
    ],
  ])('refuses %s before reading the body', async (_case, overrides, error) => {
    const result = await upload.receive(wavInput(overrides));

    expect(result).toEqual({ success: false, error, code: 'INVALID_INPUT' });
    expect(await readdir(tempDir)).toEqual([]);
  });

  it('refuses when neither base URL is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', undefined);
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', undefined);

    const result = await upload.receive(wavInput());

    expect(result).toEqual({
      success: false,
      error:
        'Server configuration is invalid: NEXT_PUBLIC_HOST_NAME or NEXT_PUBLIC_BASE_URL is not set.',
      code: 'UNAVAILABLE',
    });
  });

  it('refuses when the base URL is not an absolute URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'not-a-url');

    const result = await upload.receive(wavInput());

    expect(result).toEqual({
      success: false,
      error:
        'Server configuration is invalid: NEXT_PUBLIC_HOST_NAME or NEXT_PUBLIC_BASE_URL must be a valid absolute URL.',
      code: 'UNAVAILABLE',
    });
  });

  it('(b) an aborted receive leaves no object and no temp file', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const controller = new AbortController();
    let markRead = (): void => {};
    const firstChunkRead = new Promise<void>((resolve) => {
      markRead = resolve;
    });
    const body = new ReadableStream<Uint8Array>({
      pull(stream) {
        stream.enqueue(new Uint8Array([1, 2]));
        markRead();
        return new Promise(() => {});
      },
    });

    const pending = upload.receive(wavInput({ body, signal: controller.signal }));
    await firstChunkRead;
    controller.abort();
    const result = await pending;

    expect(result.success).toBe(false);
    expect(isStored(`releases/${RELEASE_ID}/digital-formats/WAV/1700000000000-take.wav`)).toBe(
      false
    );
    expect(await readdir(tempDir)).toEqual([]);
  });

  it('(b) an abort seen only after the put deletes the stored object', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_001);
    const controller = new AbortController();
    const lateAbortStore: FormatObjectStore = {
      ...localFormatObjectStore,
      put: async (object) => {
        await localFormatObjectStore.put(object);
        controller.abort();
      },
    };
    upload = new FormatUpload({ store: lateAbortStore, tempDir });

    const result = await upload.receive(wavInput({ signal: controller.signal }));

    expect(result).toEqual({
      success: false,
      error: 'Upload failed. Please try again.',
      code: 'UNKNOWN',
    });
    expect(isStored(`releases/${RELEASE_ID}/digital-formats/WAV/1700000000001-take.wav`)).toBe(
      false
    );
    expect(await readdir(tempDir)).toEqual([]);
  });

  it('reports a body that fails mid-transfer and removes the temp file', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.error(new Error('socket hang up'));
      },
    });

    const result = await upload.receive(wavInput({ body }));

    expect(result).toEqual({
      success: false,
      error: 'Upload failed. Please try again.',
      code: 'UNKNOWN',
    });
    expect(await readdir(tempDir)).toEqual([]);
  });

  it('logs a temp file it cannot remove and still reports the stored file', async () => {
    const warn = vi.spyOn(loggers.s3, 'warn').mockImplementation(() => {});
    // The temp path becomes a non-empty directory once the put is done, which
    // no file removal can delete.
    const blockingStore: FormatObjectStore = {
      ...localFormatObjectStore,
      put: async (object) => {
        await localFormatObjectStore.put(object);
        await unlink(object.filePath);
        await mkdir(object.filePath);
        await writeFile(join(object.filePath, 'keep'), 'x');
      },
    };
    upload = new FormatUpload({ store: blockingStore, tempDir });

    const result = await upload.receive(wavInput());

    expect(result.success).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      '[upload-proxy] Failed to clean up temp file',
      expect.objectContaining({ tempFilePath: expect.stringContaining(tempDir) })
    );
  });
});

describe('FormatUpload receive, then confirm', () => {
  it('keys names with runs of dots so its own confirm accepts the batch', async () => {
    const received = await Promise.all(
      ['03 - Wait... What.wav', 'a..b.wav'].map((fileName) =>
        upload.receive(wavInput({ fileName }))
      )
    );
    const s3Keys = received.map((result) => (result.success ? result.data.s3Key : ''));

    const confirmed = await upload.confirm(
      confirmInput(
        s3Keys.map((s3Key) => fileOf(s3Key, { fileSize: 4, mimeType: 'audio/wav' })),
        { formatType: 'WAV' }
      )
    );

    expect(s3Keys.filter((s3Key) => s3Key.includes('..'))).toEqual([]);
    expect(confirmed.success && confirmed.data.fileCount).toBe(2);
    expect(s3Keys.filter(isStored)).toEqual(s3Keys);
  });
});

describe('FormatUpload.checkNewReleaseTitle', () => {
  it('refuses a title another Release holds, with the copy', async () => {
    vi.mocked(ReleaseService.findByTitleInsensitive).mockResolvedValueOnce({
      id: 'other-release',
      title: 'Taken Title',
      publishedAt: null,
      deletedOn: null,
    });

    const result = await upload.checkNewReleaseTitle({
      releaseId: RELEASE_ID,
      title: 'taken title',
    });

    expect(result).toEqual({ success: false, error: TAKEN_COPY, code: 'DUPLICATE' });
    expect(ReleaseService.findByTitleInsensitive).toHaveBeenCalledWith('taken title');
  });

  it("passes the form's own Release, on a retry", async () => {
    vi.mocked(ReleaseService.findByTitleInsensitive).mockResolvedValueOnce({
      id: RELEASE_ID,
      title: 'Own Release',
      publishedAt: null,
      deletedOn: null,
    });

    const result = await upload.checkNewReleaseTitle({
      releaseId: RELEASE_ID,
      title: 'Own Release',
    });

    expect(result).toEqual({ success: true, data: null });
  });

  it('passes a title no Release holds', async () => {
    const result = await upload.checkNewReleaseTitle({ releaseId: RELEASE_ID, title: 'Free' });

    expect(result).toEqual({ success: true, data: null });
  });

  it('reports a failed read', async () => {
    vi.mocked(ReleaseService.findByTitleInsensitive).mockRejectedValueOnce(
      new DataError('UNAVAILABLE', 'connection refused')
    );

    const result = await upload.checkNewReleaseTitle({ releaseId: RELEASE_ID, title: 'Any' });

    expect(result).toEqual({ success: false, error: 'Database unavailable', code: 'UNAVAILABLE' });
  });
});

describe('FormatUpload.confirm', () => {
  it('confirms one file as the legacy single-file format', async () => {
    const s3Key = keyFor('one.flac');
    await seed(s3Key);

    const result = await upload.confirm(confirmInput([fileOf(s3Key)]));

    expect(result).toEqual({
      success: true,
      data: {
        releaseId: RELEASE_ID,
        releaseTitle: 'Own Release',
        formatId: 'format-1',
        fileCount: 1,
        created: false,
      },
    });
    expect(formatRepository.create.mock.calls).toEqual([
      [
        {
          release: { connect: { id: RELEASE_ID } },
          formatType: 'FLAC',
          s3Key,
          fileName: 'track.flac',
          fileSize: BigInt(100),
          mimeType: 'audio/flac',
          uploadedAt: expect.any(Date),
        },
      ],
    ]);
  });

  it('confirms several files as tracks numbered in the order given', async () => {
    const [first, second] = [keyFor('01.flac'), keyFor('02.flac')];
    await seed(first, second);

    const result = await upload.confirm(
      confirmInput([
        fileOf(first, { fileName: '01.flac', title: 'Intro', duration: 61 }),
        fileOf(second, { fileName: '02.flac', fileSize: 200 }),
      ])
    );

    expect(result.success && result.data.fileCount).toBe(2);
    expect(formatRepository.replaceTracks.mock.calls).toEqual([
      [
        RELEASE_ID,
        'FLAC',
        [
          {
            trackNumber: 1,
            s3Key: first,
            fileName: '01.flac',
            fileSize: BigInt(100),
            mimeType: 'audio/flac',
            title: 'Intro',
            duration: 61,
          },
          {
            trackNumber: 2,
            s3Key: second,
            fileName: '02.flac',
            fileSize: BigInt(200),
            mimeType: 'audio/flac',
          },
        ],
      ],
    ]);
  });

  it.each([
    [
      'one file',
      [fileOf(keyFor('a.flac'), { fileSize: 151 * 1024 * 1024 })],
      'FLAC track file size must not exceed 150 MB',
    ],
    ['no files', [], 'At least one file is required'],
  ])(
    'refuses %s the confirmation schemas refuse, and deletes nothing',
    async (_case, files, copy) => {
      await seed(...files.map(({ s3Key }) => s3Key));

      const result = await upload.confirm(confirmInput(files));

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining(copy),
        code: 'INVALID_INPUT',
      });
      expect(files.every(({ s3Key }) => isStored(s3Key))).toBe(true);
    }
  );

  it.each([
    ['single-file', [], `releases/other-release/digital-formats/FLAC/${randomUUID()}.flac`],
    [
      'multi-track',
      [keyFor('inside.flac')],
      `releases/other-release/digital-formats/FLAC/${randomUUID()}.flac`,
    ],
    ['traversing', [keyFor('inside.flac')], `${PREFIX}../../../other/${randomUUID()}.flac`],
  ])(
    '(c) refuses a %s confirm with a key outside the prefix, and deletes nothing outside it',
    async (_case, inside, outside) => {
      await seed(...inside, outside);

      const result = await upload.confirm(
        confirmInput([...inside, outside].map((key) => fileOf(key)))
      );

      expect(result).toEqual({
        success: false,
        error: `Invalid S3 key: must start with ${PREFIX}`,
        code: 'INVALID_INPUT',
      });
      expect(isStored(outside)).toBe(true);
      expect(inside.filter(isStored)).toEqual([]);
    }
  );

  it.each([0, 1, 2])(
    "(d) a missing key at position %i fails confirm and deletes the batch's other objects",
    async (missingAt) => {
      const keys = [keyFor('01.flac'), keyFor('02.flac'), keyFor('03.flac')];
      await seed(...keys.filter((_key, index) => index !== missingAt));

      const result = await upload.confirm(confirmInput(keys.map((key) => fileOf(key))));

      expect(result).toEqual({
        success: false,
        error: 'File not found in S3 storage. Upload may have failed.',
        code: 'NOT_FOUND',
      });
      expect(keys.filter(isStored)).toEqual([]);
      expect(formatRepository.replaceTracks).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['single-file', 1],
    ['multi-track', 2],
  ])('(e) a failed %s DB write deletes the uploaded objects', async (_case, count) => {
    const keys = Array.from({ length: count }, (_value, index) => keyFor(`${index}.flac`));
    await seed(...keys);
    const write = count === 1 ? formatRepository.create : formatRepository.replaceTracks;
    write.mockRejectedValueOnce(new DataError('UNKNOWN', 'write failed'));

    const result = await upload.confirm(confirmInput(keys.map((key) => fileOf(key))));

    expect(result).toEqual({ success: false, error: 'Failed to confirm upload', code: 'UNKNOWN' });
    expect(keys.filter(isStored)).toEqual([]);
  });

  it("(f) a track replacement deletes the replaced tracks' objects and keeps the new ones", async () => {
    const [oldOne, oldShared, newOne, newTwo] = [
      keyFor('old-1.flac'),
      keyFor('old-2.flac'),
      keyFor('new-1.flac'),
      keyFor('new-2.flac'),
    ];
    await seed(oldOne, oldShared, newOne, newTwo);
    formatRepository.replaceTracks.mockImplementationOnce(async () => {
      // After the commit the new tracks are the rows; another row still holds old-2.
      referenced = new Set([newOne, newTwo, oldShared]);
      return { formatId: 'format-1', fileCount: 2, replacedKeys: [oldOne, oldShared] };
    });

    const result = await upload.confirm(confirmInput([fileOf(newOne), fileOf(newTwo)]));

    expect(result.success).toBe(true);
    expect([oldOne, oldShared, newOne, newTwo].map(isStored)).toEqual([false, true, true, true]);
  });

  it('keeps a committed replacement when deleting the replaced objects fails', async () => {
    const [oldOne, newOne, newTwo] = [keyFor('old.flac'), keyFor('n1.flac'), keyFor('n2.flac')];
    await seed(oldOne, newOne, newTwo);
    formatRepository.replaceTracks.mockResolvedValueOnce({
      formatId: 'format-1',
      fileCount: 2,
      replacedKeys: [oldOne],
    });
    formatRepository.findReferencedS3Keys.mockRejectedValueOnce(
      new DataError('UNAVAILABLE', 'down')
    );
    vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    const result = await upload.confirm(confirmInput([fileOf(newOne), fileOf(newTwo)]));

    expect(result.success).toBe(true);
    expect([oldOne, newOne, newTwo].map(isStored)).toEqual([true, true, true]);
  });

  it('returns the original failure when the cleanup after it fails too', async () => {
    const s3Key = keyFor('one.flac');
    await seed(s3Key);
    formatRepository.create.mockRejectedValueOnce(new DataError('UNKNOWN', 'write failed'));
    formatRepository.findReferencedS3Keys.mockRejectedValueOnce(
      new DataError('UNAVAILABLE', 'down')
    );
    const error = vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    const result = await upload.confirm(confirmInput([fileOf(s3Key)]));

    expect(result).toEqual({ success: false, error: 'Failed to confirm upload', code: 'UNKNOWN' });
    expect(isStored(s3Key)).toBe(true);
    expect(error).toHaveBeenCalledWith(
      '[format-upload] Could not delete unconfirmed files',
      expect.any(DataError),
      { s3Keys: [s3Key] }
    );
  });

  it('(i) a duplicate single-file format fails with the duplicate copy', async () => {
    const s3Key = keyFor('one.flac');
    await seed(s3Key);
    formatRepository.create.mockRejectedValueOnce(new DataError('DUPLICATE', 'E11000'));

    const result = await upload.confirm(confirmInput([fileOf(s3Key)]));

    expect(result).toEqual({
      success: false,
      error: 'A digital format of this type already exists for this release',
      code: 'DUPLICATE',
    });
    expect(isStored(s3Key)).toBe(false);
  });

  it('fails for a Release that does not exist when no new Release is given', async () => {
    const s3Key = keyFor('one.flac');
    await seed(s3Key);
    vi.mocked(ReleaseService.findTitleById).mockResolvedValueOnce(null);

    const result = await upload.confirm(confirmInput([fileOf(s3Key)]));

    expect(result).toEqual({ success: false, error: 'Release not found', code: 'NOT_FOUND' });
    expect(isStored(s3Key)).toBe(false);
  });

  describe('(h) a new Release', () => {
    it('is refused when another Release holds the title: none is created and the objects are deleted', async () => {
      const s3Key = keyFor('one.flac');
      await seed(s3Key);
      vi.mocked(ReleaseService.findTitleById).mockResolvedValueOnce(null);
      vi.mocked(ReleaseService.findByTitleInsensitive).mockResolvedValueOnce({
        id: 'other-release',
        title: 'Taken Title',
        publishedAt: new Date(),
        deletedOn: null,
      });

      const result = await upload.confirm(
        confirmInput([fileOf(s3Key)], { newRelease: { album: 'taken title' } })
      );

      expect(result).toEqual({ success: false, error: TAKEN_COPY, code: 'DUPLICATE' });
      expect(ReleaseService.createRelease).not.toHaveBeenCalled();
      expect(isStored(s3Key)).toBe(false);
    });

    it('reuses the Release that already has the given id', async () => {
      const s3Key = keyFor('one.flac');
      await seed(s3Key);

      const result = await upload.confirm(
        confirmInput([fileOf(s3Key)], { newRelease: NEW_RELEASE })
      );

      expect(result.success && result.data).toMatchObject({
        releaseId: RELEASE_ID,
        releaseTitle: 'Own Release',
        created: false,
      });
      expect(ReleaseService.createRelease).not.toHaveBeenCalled();
    });

    it('is otherwise created with the given id from the album metadata', async () => {
      const s3Key = keyFor('one.flac');
      await seed(s3Key);
      vi.mocked(ReleaseService.findTitleById).mockResolvedValueOnce(null);

      const result = await upload.confirm(
        confirmInput([fileOf(s3Key)], {
          newRelease: { ...NEW_RELEASE, albumArtist: ' Album Artist ', artist: 'Track Artist' },
        })
      );

      expect(result.success && result.data).toMatchObject({
        releaseId: RELEASE_ID,
        releaseTitle: 'New Album',
        created: true,
      });
      expect(vi.mocked(ReleaseService.createRelease).mock.calls).toEqual([
        [
          {
            id: RELEASE_ID,
            title: 'New Album',
            releasedOn: new Date(2020, 0, 1),
            formats: ['DIGITAL'],
            labels: ['Fake Four'],
            coverArt: '',
          },
        ],
      ]);
      expect(ArtistService.findOrCreateByName).toHaveBeenCalledWith('Album Artist');
      expect(ArtistService.creditOnRelease).toHaveBeenCalledWith('artist-1', RELEASE_ID);
    });

    it('is dated today without a usable year, and keeps its cover art', async () => {
      const s3Key = keyFor('one.flac');
      await seed(s3Key);
      vi.mocked(ReleaseService.findTitleById).mockResolvedValueOnce(null);
      const before = Date.now();

      await upload.confirm(
        confirmInput([fileOf(s3Key)], {
          newRelease: { album: 'Undated', year: 1800, coverArt: 'data:image/png;base64,abc' },
        })
      );

      const [[created]] = vi.mocked(ReleaseService.createRelease).mock.calls;
      expect(created.releasedOn.getTime()).toBeGreaterThanOrEqual(before);
      expect(created).toMatchObject({ labels: [], coverArt: 'data:image/png;base64,abc' });
    });

    it('credits the track artist when there is no album artist', async () => {
      const s3Key = keyFor('one.flac');
      await seed(s3Key);
      vi.mocked(ReleaseService.findTitleById).mockResolvedValueOnce(null);

      await upload.confirm(
        confirmInput([fileOf(s3Key)], { newRelease: { album: 'Solo', artist: 'Track Artist' } })
      );

      expect(ArtistService.findOrCreateByName).toHaveBeenCalledWith('Track Artist');
    });

    it('credits nobody without an artist, and is still created when crediting fails', async () => {
      const keys = [keyFor('a.flac'), keyFor('b.flac'), keyFor('c.flac')];
      await seed(...keys);
      vi.mocked(ReleaseService.findTitleById).mockResolvedValue(null);
      vi.mocked(ArtistService.findOrCreateByName)
        .mockResolvedValueOnce({
          success: false,
          error: 'Artist name is empty',
          code: 'INVALID_INPUT',
        })
        .mockRejectedValueOnce(new Error('artist lookup failed'));
      vi.spyOn(loggers.media, 'warn').mockImplementation(() => {});

      const results = [
        await upload.confirm(confirmInput([fileOf(keys[0])], { newRelease: { album: 'One' } })),
        await upload.confirm(
          confirmInput([fileOf(keys[1])], { newRelease: { album: 'Two', artist: 'A' } })
        ),
        await upload.confirm(
          confirmInput([fileOf(keys[2])], { newRelease: { album: 'Three', artist: 'B' } })
        ),
      ];

      expect(results.map((result) => result.success && result.data.created)).toEqual([
        true,
        true,
        true,
      ]);
      expect(vi.mocked(ArtistService.findOrCreateByName).mock.calls).toEqual([['A'], ['B']]);
      expect(ArtistService.creditOnRelease).not.toHaveBeenCalled();
    });

    it('is refused with the copy when the create loses the title to another Release', async () => {
      const s3Key = keyFor('one.flac');
      await seed(s3Key);
      vi.mocked(ReleaseService.findTitleById).mockResolvedValueOnce(null);
      vi.mocked(ReleaseService.createRelease).mockResolvedValueOnce({
        success: false,
        error: 'Release with this title already exists',
        code: 'DUPLICATE',
      });

      const result = await upload.confirm(
        confirmInput([fileOf(s3Key)], { newRelease: { album: 'Taken Title' } })
      );

      expect(result).toEqual({ success: false, error: TAKEN_COPY, code: 'DUPLICATE' });
      expect(isStored(s3Key)).toBe(false);
    });

    it('reports any other failed create, and deletes the objects', async () => {
      const s3Key = keyFor('one.flac');
      await seed(s3Key);
      vi.mocked(ReleaseService.findTitleById).mockResolvedValueOnce(null);
      vi.mocked(ReleaseService.createRelease).mockResolvedValueOnce({
        success: false,
        error: 'Failed to create release',
        code: 'UNKNOWN',
      });

      const result = await upload.confirm(
        confirmInput([fileOf(s3Key)], { newRelease: { album: 'Broken' } })
      );

      expect(result).toEqual({
        success: false,
        error: 'Failed to create release',
        code: 'UNKNOWN',
      });
      expect(isStored(s3Key)).toBe(false);
    });
  });
});

describe('FormatUpload.discard', () => {
  it('(g) skips keys that a row references and keys outside the prefix', async () => {
    const [free, held] = [keyFor('free.flac'), keyFor('held.flac')];
    const outside = `releases/other-release/digital-formats/FLAC/${randomUUID()}.flac`;
    await seed(free, held, outside);
    referenced = new Set([held]);

    const result = await upload.discard({
      releaseId: RELEASE_ID,
      formatType: 'FLAC',
      s3Keys: [free, held, outside],
    });

    expect(result).toEqual({ success: true, data: { deletedCount: 1 } });
    expect([free, held, outside].map(isStored)).toEqual([false, true, true]);
    expect(formatRepository.findReferencedS3Keys).toHaveBeenCalledWith([free, held]);
  });

  it('reports a failed reference read and deletes nothing', async () => {
    const free = keyFor('free.flac');
    await seed(free);
    formatRepository.findReferencedS3Keys.mockRejectedValueOnce(
      new DataError('UNAVAILABLE', 'down')
    );

    const result = await upload.discard({
      releaseId: RELEASE_ID,
      formatType: 'FLAC',
      s3Keys: [free],
    });

    expect(result).toEqual({ success: false, error: 'Database unavailable', code: 'UNAVAILABLE' });
    expect(isStored(free)).toBe(true);
  });
});
