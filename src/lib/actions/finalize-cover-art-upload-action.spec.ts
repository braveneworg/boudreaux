/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { finalizeCoverArtUploadAction } from './finalize-cover-art-upload-action';
import { requireRole } from '../utils/auth/require-role';

vi.mock('server-only', () => ({}));
vi.mock('../utils/auth/require-role');

// Use vi.hoisted so the spy refs exist before vi.mock factories evaluate.
// Without this, the closure in CloudFrontClient's mockImplementation can
// resolve to a different vi.fn instance than the test setup mutates,
// causing mockResolvedValue(...) to silently not apply to actual calls.
const { mockS3Send, mockCfSend } = vi.hoisted(() => ({
  mockS3Send: vi.fn(),
  mockCfSend: vi.fn(),
}));

vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: () => ({ send: mockS3Send }),
  getS3BucketName: () => 'test-bucket',
}));

vi.mock('@aws-sdk/client-cloudfront', () => ({
  // CloudFrontClient is invoked with `new` in the action; an arrow-function
  // mockImplementation can't act as a constructor, so the action would catch
  // a TypeError and silently treat the invalidation as failed.
  CloudFrontClient: class {
    send = mockCfSend;
  },
  CreateInvalidationCommand: class {
    input: unknown;
    constructor(args: unknown) {
      this.input = args;
    }
  },
}));

interface FakeS3Object {
  Key: string;
}

function listResponse(keys: string[]) {
  return { Contents: keys.map((Key) => ({ Key }) as FakeS3Object), IsTruncated: false };
}

const RELEASE_ID = '69d473d0aed0e7b1d16243ac';

describe('finalizeCoverArtUploadAction', () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue({ user: { role: 'admin' } } as never);
    mockS3Send.mockReset();
    mockCfSend.mockReset();
    mockCfSend.mockResolvedValue({ Invalidation: { Id: 'INV123' } });
    vi.unstubAllEnvs();
  });

  it('requires admin role', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));
    await expect(
      finalizeCoverArtUploadAction('releases', RELEASE_ID, `media/releases/${RELEASE_ID}/cover.png`)
    ).rejects.toThrow('Unauthorized');
  });

  it('rejects unknown entity types', async () => {
    const result = await finalizeCoverArtUploadAction(
      'attackers-bucket',
      RELEASE_ID,
      `media/attackers-bucket/${RELEASE_ID}/cover.png`
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Disallowed/);
  });

  it('rejects malformed entity IDs', async () => {
    const result = await finalizeCoverArtUploadAction(
      'releases',
      'not-an-objectid',
      'media/releases/not-an-objectid/cover.png'
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid entity ID');
  });

  it('rejects newCoverKey outside the entity prefix', async () => {
    const result = await finalizeCoverArtUploadAction(
      'releases',
      RELEASE_ID,
      'media/releases/some-other-id/cover.png'
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/under prefix/);
  });

  it('rejects newCoverKey without an extension', async () => {
    const result = await finalizeCoverArtUploadAction(
      'releases',
      RELEASE_ID,
      `media/releases/${RELEASE_ID}/cover`
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('newCoverKey has no file extension');
  });

  it('deletes cross-extension orphan originals and same-format variants', async () => {
    const prefix = `media/releases/${RELEASE_ID}/`;
    // Old upload was a JPG; new upload is PNG. Variant gen overwrote the
    // shared `_w*.webp` keys but the JPG originals + JPG variants are dead.
    mockS3Send.mockImplementation((cmd) => {
      // ListObjectsV2Command
      if ('Bucket' in (cmd.input ?? cmd) && (cmd.input ?? cmd).Prefix === prefix) {
        return Promise.resolve(
          listResponse([
            `${prefix}cover.png`, // new — keep
            `${prefix}cover_w640.png`, // new — keep
            `${prefix}cover_w750.png`, // new — keep
            `${prefix}cover_w640.webp`, // overwritten by new variant gen — keep
            `${prefix}cover.jpg`, // orphan — delete
            `${prefix}cover_w640.jpg`, // orphan — delete
            `${prefix}cover_w1080.jpg`, // orphan — delete
          ])
        );
      }
      // DeleteObjectsCommand
      return Promise.resolve({ Deleted: [] });
    });

    const result = await finalizeCoverArtUploadAction('releases', RELEASE_ID, `${prefix}cover.png`);

    expect(result.success).toBe(true);
    expect(result.deletedKeys.sort()).toEqual(
      [`${prefix}cover.jpg`, `${prefix}cover_w640.jpg`, `${prefix}cover_w1080.jpg`].sort()
    );
  });

  it('returns success with no deletions when only the new cover family is present', async () => {
    const prefix = `media/releases/${RELEASE_ID}/`;
    mockS3Send.mockResolvedValue(
      listResponse([`${prefix}cover.png`, `${prefix}cover_w640.png`, `${prefix}cover_w640.webp`])
    );

    const result = await finalizeCoverArtUploadAction('releases', RELEASE_ID, `${prefix}cover.png`);

    expect(result.success).toBe(true);
    expect(result.deletedKeys).toEqual([]);
    // List only — no Delete call when nothing to delete.
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  it('treats a prior cover.webp as an orphan when new ext differs', async () => {
    const prefix = `media/releases/${RELEASE_ID}/`;
    mockS3Send.mockImplementation((cmd) => {
      if ((cmd.input ?? cmd).Prefix === prefix) {
        return Promise.resolve(
          listResponse([
            `${prefix}cover.png`, // new
            `${prefix}cover_w640.png`,
            `${prefix}cover_w640.webp`, // shared variant — keep
            `${prefix}cover.webp`, // old original at .webp — orphan
          ])
        );
      }
      return Promise.resolve({});
    });

    const result = await finalizeCoverArtUploadAction('releases', RELEASE_ID, `${prefix}cover.png`);

    expect(result.success).toBe(true);
    expect(result.deletedKeys).toEqual([`${prefix}cover.webp`]);
  });

  it('issues a single wildcard CloudFront invalidation when configured', async () => {
    vi.stubEnv('CLOUDFRONT_DISTRIBUTION_ID', 'EDIST');
    const prefix = `media/releases/${RELEASE_ID}/`;
    mockS3Send.mockResolvedValue(listResponse([`${prefix}cover.png`]));

    const result = await finalizeCoverArtUploadAction('releases', RELEASE_ID, `${prefix}cover.png`);

    expect(result.success).toBe(true);
    expect(mockCfSend).toHaveBeenCalledTimes(1);

    const invCmd = mockCfSend.mock.calls[0][0];
    const items = (invCmd.input ?? invCmd).InvalidationBatch.Paths.Items;
    expect(items).toEqual([`/${prefix}*`]);
    expect(result.invalidationId).toBe('INV123');
  });

  it('returns success even if CloudFront invalidation throws', async () => {
    vi.stubEnv('CLOUDFRONT_DISTRIBUTION_ID', 'EDIST');
    const prefix = `media/releases/${RELEASE_ID}/`;
    mockS3Send.mockResolvedValue(listResponse([`${prefix}cover.png`]));
    mockCfSend.mockRejectedValue(new Error('CF throttled'));

    const result = await finalizeCoverArtUploadAction('releases', RELEASE_ID, `${prefix}cover.png`);

    expect(result.success).toBe(true);
    expect(result.invalidationId).toBeUndefined();
  });

  it('skips CloudFront entirely when no distribution ID is configured', async () => {
    const prefix = `media/releases/${RELEASE_ID}/`;
    mockS3Send.mockResolvedValue(listResponse([`${prefix}cover.png`]));

    const result = await finalizeCoverArtUploadAction('releases', RELEASE_ID, `${prefix}cover.png`);

    expect(result.success).toBe(true);
    expect(mockCfSend).not.toHaveBeenCalled();
  });

  it('returns error on S3 list failure', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('Access Denied'));
    const result = await finalizeCoverArtUploadAction(
      'releases',
      RELEASE_ID,
      `media/releases/${RELEASE_ID}/cover.png`
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Access Denied/);
  });
});
