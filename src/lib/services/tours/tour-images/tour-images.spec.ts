/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DataError } from '@/lib/types/domain/errors';

import { TourImages } from './tour-images';

import type {
  NewTourImageRecord,
  TourImageOwnerKind,
  TourImagePut,
  TourImageRecords,
  TourImageStore,
} from './types';

vi.mock('server-only', () => ({}));
vi.mock('./tour-image-records', () => ({ tourImageRecords: {}, tourDateImageRecords: {} }));
vi.mock('./tour-image-store', () => ({ s3TourImageStore: {} }));

const OWNER_ID = 'owner-1';
const OTHER_OWNER_ID = 'owner-2';
const CDN = 'https://cdn.example.com';

/** A stored row of either model, keyed by its owner field. */
type FakeRow = Record<string, unknown> & {
  id: string;
  displayOrder: number;
  altText: string | null;
};

/** The in-memory store adapter: records what was signed and deleted. */
interface FakeStore extends TourImageStore {
  puts: TourImagePut[];
  deleted: string[];
  failDelete: boolean;
}

const createFakeStore = (log: string[]): FakeStore => {
  const store: FakeStore = {
    puts: [],
    deleted: [],
    failDelete: false,
    presignPut: async (put) => {
      store.puts.push(put);
      return {
        success: true,
        data: {
          uploadUrl: `https://bucket.s3.amazonaws.com/${put.s3Key}?signed`,
          s3Key: put.s3Key,
          s3Bucket: 'bucket',
          expiresIn: 900,
        },
      };
    },
    delete: async (s3Key) => {
      log.push(`store.delete ${s3Key}`);
      if (store.failDelete) {
        return false;
      }
      store.deleted.push(s3Key);
      return true;
    },
    publicUrl: (s3Key) => `${CDN}/${s3Key}`,
  };
  return store;
};

/** The in-memory records adapter for one model, storing rows under `ownerKey`. */
interface FakeRecords extends TourImageRecords<FakeRow> {
  rows: Map<string, FakeRow>;
  /** Store a row at a given display order, bypassing the cap (for seeding). */
  insert: (record: NewTourImageRecord & { displayOrder: number }) => FakeRow;
}

const createFakeRecords = (ownerKey: string, log: string[]): FakeRecords => {
  const rows = new Map<string, FakeRow>();
  const owners = new Map<string, string>();
  let nextId = 1;
  const ownedBy = (ownerId: string): FakeRow[] =>
    [...rows.values()]
      .filter((row) => owners.get(row.id) === ownerId)
      .toSorted((a, b) => a.displayOrder - b.displayOrder);

  const insert = ({
    ownerId,
    altText,
    uploadedBy,
    ...rest
  }: NewTourImageRecord & { displayOrder: number }): FakeRow => {
    const row: FakeRow = {
      ...rest,
      id: `image-${nextId++}`,
      [ownerKey]: ownerId,
      altText: altText ?? null,
      uploadedBy: uploadedBy ?? null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    rows.set(row.id, row);
    owners.set(row.id, ownerId);
    return row;
  };

  return {
    rows,
    insert,
    ownerIdOf: (row) => owners.get(row.id) ?? '',
    findByOwner: async (ownerId) => ownedBy(ownerId),
    count: async (ownerId) => ownedBy(ownerId).length,
    findById: async (id) => rows.get(id) ?? null,
    createWithinCap: async (record, maxImages) => {
      const displayOrder = ownedBy(record.ownerId).length;
      return displayOrder >= maxImages ? null : insert({ ...record, displayOrder });
    },
    delete: async (id) => {
      log.push(`records.delete ${id}`);
      rows.delete(id);
    },
    reorder: async (orders) => {
      for (const { id, displayOrder } of orders) {
        const row = rows.get(id);
        if (row) {
          rows.set(id, { ...row, displayOrder });
        }
      }
    },
  };
};

interface OwnerFacts {
  kind: TourImageOwnerKind;
  ownerKey: string;
  label: string;
  max: number;
  keyPrefix: string;
}

const OWNERS: OwnerFacts[] = [
  { kind: 'tour', ownerKey: 'tourId', label: 'tour', max: 10, keyPrefix: 'media/tours/owner-1/' },
  {
    kind: 'tourDate',
    ownerKey: 'tourDateId',
    label: 'tour date',
    max: 20,
    keyPrefix: 'media/tour-dates/owner-1/',
  },
];

const FILE = { fileName: 'photo.jpg', fileSize: 1024, mimeType: 'image/jpeg' as const };

describe.each(OWNERS)('TourImages for a $label', ({ kind, ownerKey, label, max, keyPrefix }) => {
  let log: string[];
  let store: FakeStore;
  let records: FakeRecords;
  let otherRecords: FakeRecords;
  let images: TourImages;
  const owner = { kind, id: OWNER_ID };

  /** Seed `count` images on `ownerId`, in display order. */
  const seed = async (count: number, ownerId = OWNER_ID): Promise<FakeRow[]> => {
    const seeded: FakeRow[] = [];
    for (let index = 0; index < count; index++) {
      seeded.push(
        records.insert({
          ownerId,
          s3Key: `media/seed-${ownerId}-${index}.jpg`,
          s3Url: `${CDN}/media/seed-${ownerId}-${index}.jpg`,
          s3Bucket: 'bucket',
          fileName: `seed-${index}.jpg`,
          fileSize: 10,
          mimeType: 'image/jpeg',
          displayOrder: index,
        })
      );
    }
    return seeded;
  };

  beforeEach(() => {
    log = [];
    store = createFakeStore(log);
    records = createFakeRecords(ownerKey, log);
    otherRecords = createFakeRecords('unused', log);
    images = new TourImages({
      store,
      records:
        kind === 'tour'
          ? { tour: records as never, tourDate: otherRecords as never }
          : { tour: otherRecords as never, tourDate: records as never },
    });
  });

  describe('list', () => {
    it("returns only the owner's images, in display order", async () => {
      await seed(2);
      await seed(1, OTHER_OWNER_ID);

      const result = await images.list(owner);

      expect(result.success && result.data.map((row) => row.fileName)).toEqual([
        'seed-0.jpg',
        'seed-1.jpg',
      ]);
    });

    it('fails with the data error code when the read throws', async () => {
      records.findByOwner = async () => {
        throw new DataError('UNAVAILABLE', 'down');
      };

      const result = await images.list(owner);

      expect(result).toEqual({
        success: false,
        error: 'Database unavailable',
        code: 'UNAVAILABLE',
      });
    });
  });

  describe('requestUpload', () => {
    it('signs a PUT under the owner key prefix, with the owner in the object metadata', async () => {
      const result = await images.requestUpload(owner, FILE);

      expect(store.puts).toHaveLength(1);
      expect(store.puts[0]).toEqual({
        s3Key: expect.stringMatching(/\/photo-\d+-[a-z0-9]+\.jpg$/),
        mimeType: 'image/jpeg',
        fileSize: 1024,
        metadata: {
          [ownerKey]: OWNER_ID,
          originalFileName: 'photo.jpg',
          uploadedAt: expect.any(String),
        },
      });
      expect(result).toEqual({
        success: true,
        data: expect.objectContaining({ s3Key: store.puts[0].s3Key, expiresIn: 900 }),
      });
    });

    it("puts the object under the owner's key namespace", async () => {
      await images.requestUpload(owner, FILE);

      expect(store.puts[0].s3Key.startsWith(keyPrefix)).toBe(true);
    });

    it('signs while the owner is one under the cap', async () => {
      await seed(max - 1);

      const result = await images.requestUpload(owner, FILE);

      expect(result.success).toBe(true);
    });

    it('refuses at the cap without signing anything', async () => {
      await seed(max);

      const result = await images.requestUpload(owner, FILE);

      expect(result).toEqual({
        success: false,
        error: `Maximum of ${max} images per ${label} exceeded`,
        code: 'LIMIT_EXCEEDED',
      });
      expect(store.puts).toEqual([]);
    });

    it("counts only this owner's images toward the cap", async () => {
      await seed(max, OTHER_OWNER_ID);

      const result = await images.requestUpload(owner, FILE);

      expect(result.success).toBe(true);
    });

    it('passes a signing failure through', async () => {
      store.presignPut = async () => ({
        success: false,
        error: 'Failed to generate upload URL',
        code: 'UNKNOWN',
      });

      const result = await images.requestUpload(owner, FILE);

      expect(result).toEqual({
        success: false,
        error: 'Failed to generate upload URL',
        code: 'UNKNOWN',
      });
    });

    it('fails with generic copy, never the thrown text, when the count throws', async () => {
      records.count = async () => {
        throw new Error('connection string mongodb://secret@host');
      };

      const result = await images.requestUpload(owner, FILE);

      expect(result).toEqual({
        success: false,
        error: 'Failed to generate upload URL',
        code: 'UNKNOWN',
      });
    });
  });

  describe('confirmUpload', () => {
    const newKey = `${keyPrefix}photo-1767225600000-ab12cd.jpg`;
    const upload = { ...FILE, s3Key: newKey, s3Bucket: 'bucket', altText: 'A crowd' };

    it.each([
      ["another owner's object", keyPrefix.replace(OWNER_ID, OTHER_OWNER_ID) + 'photo-1-ab.jpg'],
      ['a release cover', 'media/releases/release-1/cover-1-ab.jpg'],
      ['an object outside media/', 'private/backup-1-ab.jpg'],
      ['a key that climbs out of the namespace', `${keyPrefix}../${OTHER_OWNER_ID}/photo-1-ab.jpg`],
      ['a key in a folder under the namespace', `${keyPrefix}nested/photo-1-ab.jpg`],
      ['the bare namespace', keyPrefix],
    ])('refuses %s, recording nothing and deleting nothing', async (_case, s3Key) => {
      await seed(max);

      const result = await images.confirmUpload(owner, { ...upload, s3Key }, 'admin-1');

      expect({ result, log, rows: records.rows.size }).toEqual({
        result: {
          success: false,
          error: `The uploaded object is not one of this ${label}'s images`,
          code: 'INVALID_INPUT',
        },
        log: [],
        rows: max,
      });
    });

    it('appends the image after the existing ones, served from the public URL', async () => {
      await seed(2);

      const result = await images.confirmUpload(owner, upload, 'admin-1');

      expect(result).toEqual({
        success: true,
        data: {
          id: 'image-3',
          [ownerKey]: OWNER_ID,
          s3Key: newKey,
          s3Url: `${CDN}/${newKey}`,
          s3Bucket: 'bucket',
          fileName: 'photo.jpg',
          fileSize: 1024,
          mimeType: 'image/jpeg',
          displayOrder: 2,
          altText: 'A crowd',
          uploadedBy: 'admin-1',
        },
      });
    });

    it('gives the first image display order 0 and omits a missing alt text', async () => {
      const result = await images.confirmUpload(
        owner,
        { ...upload, altText: undefined },
        'admin-1'
      );

      expect(result.success && [result.data.displayOrder, result.data.altText]).toEqual([
        0,
        undefined,
      ]);
    });

    it('refuses a confirm that would pass the cap, deleting the uploaded object', async () => {
      await seed(max);

      const result = await images.confirmUpload(owner, upload, 'admin-1');

      expect(result).toEqual({
        success: false,
        error: `Maximum of ${max} images per ${label} exceeded`,
        code: 'LIMIT_EXCEEDED',
      });
      expect(log).toEqual([`store.delete ${newKey}`]);
      expect(records.rows.size).toBe(max);
    });

    it('confirms the image that fills the cap', async () => {
      await seed(max - 1);

      const result = await images.confirmUpload(owner, upload, 'admin-1');

      expect(result.success && result.data.displayOrder).toBe(max - 1);
    });

    it('fails with generic copy when the write throws', async () => {
      records.createWithinCap = async () => {
        throw new Error('E11000 duplicate key');
      };

      const result = await images.confirmUpload(owner, upload, 'admin-1');

      expect(result).toEqual({
        success: false,
        error: 'Failed to confirm upload',
        code: 'UNKNOWN',
      });
    });
  });

  describe('delete', () => {
    it('refuses an image that does not exist', async () => {
      const result = await images.delete(owner, 'missing');

      expect(result).toEqual({ success: false, error: 'Image not found', code: 'NOT_FOUND' });
    });

    it('refuses an image another owner holds, leaving the object and the row', async () => {
      const [foreign] = await seed(1, OTHER_OWNER_ID);

      const result = await images.delete(owner, foreign.id);

      expect(result).toEqual({
        success: false,
        error: `Image does not belong to specified ${label}`,
        code: 'INVALID_INPUT',
      });
      expect(log).toEqual([]);
    });

    it('deletes the object, then the row', async () => {
      const [image] = await seed(1);

      const result = await images.delete(owner, image.id);

      expect(log).toEqual([`store.delete ${image.s3Key}`, `records.delete ${image.id}`]);
      expect(result).toEqual({ success: true, data: undefined });
    });

    it('still deletes the row when the object delete fails', async () => {
      const [image] = await seed(1);
      store.failDelete = true;

      const result = await images.delete(owner, image.id);

      expect(records.rows.has(image.id)).toBe(false);
      expect(result).toEqual({ success: true, data: undefined });
    });

    it('fails with generic copy when the row delete throws', async () => {
      const [image] = await seed(1);
      records.delete = async () => {
        throw new Error('raw driver text');
      };

      const result = await images.delete(owner, image.id);

      expect(result).toEqual({ success: false, error: 'Failed to delete image', code: 'UNKNOWN' });
    });
  });

  describe('reorder', () => {
    it('refuses an order naming an image the owner does not hold', async () => {
      const [image] = await seed(1);
      const [foreign] = await seed(1, OTHER_OWNER_ID);

      const result = await images.reorder(owner, [
        { id: image.id, displayOrder: 1 },
        { id: foreign.id, displayOrder: 0 },
      ]);

      expect(result).toEqual({
        success: false,
        error: `Image ${foreign.id} does not belong to ${label} ${OWNER_ID}`,
        code: 'INVALID_INPUT',
      });
      expect(records.rows.get(image.id)?.displayOrder).toBe(0);
    });

    it('writes the new order', async () => {
      const [first, second] = await seed(2);

      const result = await images.reorder(owner, [
        { id: second.id, displayOrder: 0 },
        { id: first.id, displayOrder: 1 },
      ]);

      expect(result).toEqual({ success: true, data: undefined });
      expect((await records.findByOwner(OWNER_ID)).map((row) => row.id)).toEqual([
        second.id,
        first.id,
      ]);
    });

    it('fails with generic copy when the write throws', async () => {
      const [image] = await seed(1);
      records.reorder = async () => {
        throw new Error('raw driver text');
      };

      const result = await images.reorder(owner, [{ id: image.id, displayOrder: 0 }]);

      expect(result).toEqual({
        success: false,
        error: 'Failed to reorder images',
        code: 'UNKNOWN',
      });
    });
  });
});
