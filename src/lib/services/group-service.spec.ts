/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment node
import { Prisma } from '@prisma/client';

import { prisma } from '../prisma';
import { GroupService } from './group-service';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock PrismaClient
vi.mock('../prisma', () => ({
  prisma: {
    group: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    image: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    artist: {
      findUnique: vi.fn(),
    },
    artistGroup: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock S3 client
const mockS3Send = vi.fn().mockResolvedValue({});
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function () {
    return { send: mockS3Send };
  }),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}));

describe('GroupService', () => {
  const mockGroup = {
    id: 'group-123',
    name: 'test-group',
    displayName: 'Test Group',
    description: 'A test group',
    images: [],
    artistGroups: [],
    urls: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // createGroup
  // ===========================================================================

  describe('createGroup', () => {
    const createInput: Prisma.GroupCreateInput = {
      name: 'test-group',
      displayName: 'Test Group',
    };

    it('should create a group successfully', async () => {
      vi.mocked(prisma.group.create).mockResolvedValue(mockGroup as never);

      const result = await GroupService.createGroup(createInput);

      expect(result).toMatchObject({ success: true, data: mockGroup });
      expect(prisma.group.create).toHaveBeenCalledWith({
        data: createInput,
        include: {
          images: true,
          artistGroups: true,
          urls: true,
        },
      });
    });

    it('should return error when name already exists (P2002)', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.group.create).mockRejectedValue(prismaError);

      const result = await GroupService.createGroup(createInput);

      expect(result).toMatchObject({
        success: false,
        error: 'Group with this name already exists',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.group.create).mockRejectedValue(initError);

      const result = await GroupService.createGroup(createInput);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.group.create).mockRejectedValue(Error('Unknown error'));

      const result = await GroupService.createGroup(createInput);

      expect(result).toMatchObject({ success: false, error: 'Failed to create group' });
    });
  });

  // ===========================================================================
  // getGroupById
  // ===========================================================================

  describe('getGroupById', () => {
    it('should retrieve a group by ID', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue(mockGroup as never);

      const result = await GroupService.getGroupById('group-123');

      expect(result).toMatchObject({ success: true, data: mockGroup });
      expect(prisma.group.findUnique).toHaveBeenCalledWith({
        where: { id: 'group-123' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          artistGroups: {
            include: {
              artist: {
                select: {
                  id: true,
                  firstName: true,
                  surname: true,
                  displayName: true,
                  images: {
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });
    });

    it('should return error when group not found', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue(null);

      const result = await GroupService.getGroupById('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Group not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.group.findUnique).mockRejectedValue(initError);

      const result = await GroupService.getGroupById('group-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.group.findUnique).mockRejectedValue(Error('Unknown error'));

      const result = await GroupService.getGroupById('group-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve group' });
    });
  });

  // ===========================================================================
  // getGroups
  // ===========================================================================

  describe('getGroups', () => {
    const mockGroups = [
      mockGroup,
      {
        ...mockGroup,
        id: 'group-456',
        name: 'another-group',
        displayName: 'Another Group',
      },
    ];

    it('should retrieve all groups with default parameters', async () => {
      vi.mocked(prisma.group.findMany).mockResolvedValue(mockGroups as never);

      const result = await GroupService.getGroups();

      expect(result).toMatchObject({ success: true, data: mockGroups });
      expect(prisma.group.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 3,
          },
          artistGroups: {
            include: {
              artist: {
                select: {
                  id: true,
                  firstName: true,
                  surname: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });
    });

    it('should retrieve groups with custom pagination', async () => {
      vi.mocked(prisma.group.findMany).mockResolvedValue([mockGroup] as never);

      const result = await GroupService.getGroups({ skip: 10, take: 5 });

      expect(result.success).toBe(true);
      expect(prisma.group.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 10,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 3,
          },
          artistGroups: {
            include: {
              artist: {
                select: {
                  id: true,
                  firstName: true,
                  surname: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });
    });

    it('should search across name and displayName fields', async () => {
      vi.mocked(prisma.group.findMany).mockResolvedValue([mockGroup] as never);

      const result = await GroupService.getGroups({ search: 'test' });

      expect(result.success).toBe(true);
      expect(prisma.group.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'test', mode: 'insensitive' } },
            { displayName: { contains: 'test', mode: 'insensitive' } },
          ],
        },
        skip: 0,
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 3,
          },
          artistGroups: {
            include: {
              artist: {
                select: {
                  id: true,
                  firstName: true,
                  surname: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });
    });

    it('should combine pagination and search', async () => {
      vi.mocked(prisma.group.findMany).mockResolvedValue([mockGroup] as never);

      const result = await GroupService.getGroups({
        skip: 5,
        take: 10,
        search: 'group',
      });

      expect(result.success).toBe(true);
      expect(prisma.group.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'group', mode: 'insensitive' } },
            { displayName: { contains: 'group', mode: 'insensitive' } },
          ],
        },
        skip: 5,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 3,
          },
          artistGroups: {
            include: {
              artist: {
                select: {
                  id: true,
                  firstName: true,
                  surname: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });
    });

    it('should return empty array when no groups found', async () => {
      vi.mocked(prisma.group.findMany).mockResolvedValue([]);

      const result = await GroupService.getGroups();

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.group.findMany).mockRejectedValue(initError);

      const result = await GroupService.getGroups();

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.group.findMany).mockRejectedValue(Error('Unknown error'));

      const result = await GroupService.getGroups();

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve groups' });
    });
  });

  // ===========================================================================
  // updateGroup
  // ===========================================================================

  describe('updateGroup', () => {
    const updateData: Prisma.GroupUpdateInput = {
      displayName: 'Updated Group Name',
    };

    it('should update a group successfully', async () => {
      const updatedGroup = { ...mockGroup, displayName: 'Updated Group Name' };
      vi.mocked(prisma.group.update).mockResolvedValue(updatedGroup as never);

      const result = await GroupService.updateGroup('group-123', updateData);

      expect(result).toMatchObject({ success: true, data: updatedGroup });
      expect(prisma.group.update).toHaveBeenCalledWith({
        where: { id: 'group-123' },
        data: updateData,
      });
    });

    it('should return error when group not found (P2025)', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.group.update).mockRejectedValue(notFoundError);

      const result = await GroupService.updateGroup('non-existent', updateData);

      expect(result).toMatchObject({ success: false, error: 'Group not found' });
    });

    it('should return error when name already exists (P2002)', async () => {
      const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.group.update).mockRejectedValue(uniqueError);

      const result = await GroupService.updateGroup('group-123', updateData);

      expect(result).toMatchObject({
        success: false,
        error: 'Group with this name already exists',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.group.update).mockRejectedValue(initError);

      const result = await GroupService.updateGroup('group-123', updateData);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.group.update).mockRejectedValue(Error('Unknown error'));

      const result = await GroupService.updateGroup('group-123', updateData);

      expect(result).toMatchObject({ success: false, error: 'Failed to update group' });
    });
  });

  // ===========================================================================
  // deleteGroup
  // ===========================================================================

  describe('deleteGroup', () => {
    it('should delete a group successfully', async () => {
      vi.mocked(prisma.group.delete).mockResolvedValue(mockGroup as never);

      const result = await GroupService.deleteGroup('group-123');

      expect(result).toMatchObject({ success: true, data: mockGroup });
      expect(prisma.group.delete).toHaveBeenCalledWith({
        where: { id: 'group-123' },
      });
    });

    it('should return error when group not found (P2025)', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.group.delete).mockRejectedValue(notFoundError);

      const result = await GroupService.deleteGroup('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Group not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.group.delete).mockRejectedValue(initError);

      const result = await GroupService.deleteGroup('group-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.group.delete).mockRejectedValue(Error('Unknown error'));

      const result = await GroupService.deleteGroup('group-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to delete group' });
    });
  });

  // ===========================================================================
  // uploadGroupImages
  // ===========================================================================

  describe('uploadGroupImages', () => {
    const mockImageInput = {
      file: Buffer.from('fake-image-data'),
      fileName: 'test-image.jpg',
      contentType: 'image/jpeg',
      caption: 'Test caption',
      altText: 'Test alt text',
    };

    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env.AWS_S3_BUCKET_NAME = 'test-bucket';
      process.env.AWS_CLOUDFRONT_DOMAIN = 'cdn.example.com';
      process.env.AWS_REGION = 'us-east-1';
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should upload images successfully', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue({ id: 'group-123' } as never);
      vi.mocked(prisma.image.aggregate).mockResolvedValue({
        _max: { sortOrder: 1 },
      } as never);
      vi.mocked(prisma.image.create).mockResolvedValue({
        id: 'image-1',
        src: 'https://cdn.example.com/media/groups/group-123/test-image.jpg',
        caption: 'Test caption',
        altText: 'Test alt text',
        sortOrder: 2,
      } as never);

      const result = await GroupService.uploadGroupImages('group-123', [mockImageInput]);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('data');
      const { data } = result as { success: true; data: { id: string; sortOrder: number }[] };
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe('image-1');
      expect(data[0].sortOrder).toBe(2);
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it('should upload multiple images with incrementing sort order', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue({ id: 'group-123' } as never);
      vi.mocked(prisma.image.aggregate).mockResolvedValue({
        _max: { sortOrder: 0 },
      } as never);

      let callCount = 0;
      vi.mocked(prisma.image.create).mockImplementation((() => {
        callCount++;
        return Promise.resolve({
          id: `image-${callCount}`,
          src: `https://cdn.example.com/media/groups/group-123/image-${callCount}.jpg`,
          caption: null,
          altText: null,
          sortOrder: callCount,
        });
      }) as never);

      const images = [
        { ...mockImageInput, fileName: 'image-1.jpg' },
        { ...mockImageInput, fileName: 'image-2.jpg' },
      ];

      const result = await GroupService.uploadGroupImages('group-123', images);

      expect(result.success).toBe(true);
      const { data } = result as { success: true; data: { sortOrder: number }[] };
      expect(data).toHaveLength(2);
      expect(mockS3Send).toHaveBeenCalledTimes(2);
      expect(prisma.image.create).toHaveBeenCalledTimes(2);
    });

    it('should start sort order at 0 when no existing images', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue({ id: 'group-123' } as never);
      vi.mocked(prisma.image.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.image.create).mockResolvedValue({
        id: 'image-1',
        src: 'https://cdn.example.com/media/groups/group-123/test-image.jpg',
        caption: 'Test caption',
        altText: 'Test alt text',
        sortOrder: 0,
      } as never);

      const result = await GroupService.uploadGroupImages('group-123', [mockImageInput]);

      expect(result.success).toBe(true);
      const { data } = result as { success: true; data: { sortOrder: number }[] };
      expect(data[0].sortOrder).toBe(0);
    });

    it('should return error when group not found', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue(null);

      const result = await GroupService.uploadGroupImages('non-existent', [mockImageInput]);

      expect(result).toMatchObject({ success: false, error: 'Group not found' });
    });

    it('should return error when S3 bucket not configured', async () => {
      delete process.env.AWS_S3_BUCKET_NAME;
      vi.mocked(prisma.group.findUnique).mockResolvedValue({ id: 'group-123' } as never);
      vi.mocked(prisma.image.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);

      const result = await GroupService.uploadGroupImages('group-123', [mockImageInput]);

      expect(result).toMatchObject({ success: false, error: 'S3 bucket not configured' });
    });

    it('should use S3 URL when CloudFront domain is not configured', async () => {
      delete process.env.AWS_CLOUDFRONT_DOMAIN;
      vi.mocked(prisma.group.findUnique).mockResolvedValue({ id: 'group-123' } as never);
      vi.mocked(prisma.image.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.image.create).mockResolvedValue({
        id: 'image-1',
        src: 'https://test-bucket.s3.amazonaws.com/media/groups/group-123/test-image.jpg',
        caption: null,
        altText: null,
        sortOrder: 0,
      } as never);

      const result = await GroupService.uploadGroupImages('group-123', [mockImageInput]);

      expect(result.success).toBe(true);
      expect(prisma.image.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            groupId: 'group-123',
          }),
        })
      );
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.group.findUnique).mockRejectedValue(initError);

      const result = await GroupService.uploadGroupImages('group-123', [mockImageInput]);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors during upload', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue({ id: 'group-123' } as never);
      vi.mocked(prisma.image.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      mockS3Send.mockRejectedValueOnce(new Error('S3 upload failed'));

      const result = await GroupService.uploadGroupImages('group-123', [mockImageInput]);

      expect(result).toMatchObject({ success: false, error: 'Failed to upload images' });
    });
  });

  // ===========================================================================
  // deleteGroupImage
  // ===========================================================================

  describe('deleteGroupImage', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env.AWS_S3_BUCKET_NAME = 'test-bucket';
      process.env.AWS_CLOUDFRONT_DOMAIN = 'cdn.example.com';
      process.env.AWS_REGION = 'us-east-1';
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should delete a group image with CDN URL successfully', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-1',
        src: 'https://cdn.example.com/media/groups/group-123/test-image.jpg',
        groupId: 'group-123',
      } as never);
      vi.mocked(prisma.image.delete).mockResolvedValue({} as never);

      const result = await GroupService.deleteGroupImage('image-1');

      expect(result).toMatchObject({ success: true, data: { deleted: true } });
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(prisma.image.delete).toHaveBeenCalledWith({
        where: { id: 'image-1' },
      });
    });

    it('should delete a group image with S3 URL successfully', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-1',
        src: 'https://test-bucket.s3.amazonaws.com/media/groups/group-123/test-image.jpg',
        groupId: 'group-123',
      } as never);
      vi.mocked(prisma.image.delete).mockResolvedValue({} as never);

      const result = await GroupService.deleteGroupImage('image-1');

      expect(result).toMatchObject({ success: true, data: { deleted: true } });
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(prisma.image.delete).toHaveBeenCalledWith({
        where: { id: 'image-1' },
      });
    });

    it('should delete from DB even when image has no src', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-1',
        src: null,
        groupId: 'group-123',
      } as never);
      vi.mocked(prisma.image.delete).mockResolvedValue({} as never);

      const result = await GroupService.deleteGroupImage('image-1');

      expect(result).toMatchObject({ success: true, data: { deleted: true } });
      expect(mockS3Send).not.toHaveBeenCalled();
      expect(prisma.image.delete).toHaveBeenCalledWith({
        where: { id: 'image-1' },
      });
    });

    it('should return error when image not found', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue(null);

      const result = await GroupService.deleteGroupImage('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Image not found' });
    });

    it('should return error when image does not belong to a group', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-1',
        src: 'https://cdn.example.com/media/test.jpg',
        groupId: null,
      } as never);

      const result = await GroupService.deleteGroupImage('image-1');

      expect(result).toMatchObject({ success: false, error: 'Image does not belong to a group' });
    });

    it('should return error on P2025 during delete', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-1',
        src: 'https://cdn.example.com/media/groups/group-123/test-image.jpg',
        groupId: 'group-123',
      } as never);
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.image.delete).mockRejectedValue(notFoundError);

      const result = await GroupService.deleteGroupImage('image-1');

      expect(result).toMatchObject({ success: false, error: 'Image not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.image.findUnique).mockRejectedValue(initError);

      const result = await GroupService.deleteGroupImage('image-1');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.image.findUnique).mockRejectedValue(Error('Unknown error'));

      const result = await GroupService.deleteGroupImage('image-1');

      expect(result).toMatchObject({ success: false, error: 'Failed to delete image' });
    });
  });

  // ===========================================================================
  // reorderGroupImages
  // ===========================================================================

  describe('reorderGroupImages', () => {
    const imageIds = ['image-1', 'image-2', 'image-3'];

    it('should reorder images successfully', async () => {
      vi.mocked(prisma.image.findMany)
        .mockResolvedValueOnce([{ id: 'image-1' }, { id: 'image-2' }, { id: 'image-3' }] as never)
        .mockResolvedValueOnce([
          {
            id: 'image-1',
            src: 'https://cdn.example.com/img1.jpg',
            caption: null,
            altText: null,
            sortOrder: 0,
          },
          {
            id: 'image-2',
            src: 'https://cdn.example.com/img2.jpg',
            caption: null,
            altText: null,
            sortOrder: 1,
          },
          {
            id: 'image-3',
            src: 'https://cdn.example.com/img3.jpg',
            caption: null,
            altText: null,
            sortOrder: 2,
          },
        ] as never);
      vi.mocked(prisma.image.update).mockResolvedValue({} as never);

      const result = await GroupService.reorderGroupImages('group-123', imageIds);

      expect(result.success).toBe(true);
      const { data } = result as { success: true; data: { id: string; sortOrder: number }[] };
      expect(data).toHaveLength(3);
      expect(data[0].sortOrder).toBe(0);
      expect(data[1].sortOrder).toBe(1);
      expect(data[2].sortOrder).toBe(2);
      expect(prisma.image.update).toHaveBeenCalledTimes(3);
    });

    it('should return error when some images not found', async () => {
      vi.mocked(prisma.image.findMany).mockResolvedValueOnce([{ id: 'image-1' }] as never);

      const result = await GroupService.reorderGroupImages('group-123', imageIds);

      expect(result).toMatchObject({
        success: false,
        error: 'Some images not found or do not belong to this group',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.image.findMany).mockRejectedValue(initError);

      const result = await GroupService.reorderGroupImages('group-123', imageIds);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.image.findMany).mockRejectedValue(Error('Unknown error'));

      const result = await GroupService.reorderGroupImages('group-123', imageIds);

      expect(result).toMatchObject({ success: false, error: 'Failed to reorder images' });
    });
  });

  // ===========================================================================
  // addGroupMember
  // ===========================================================================

  describe('addGroupMember', () => {
    it('should add an artist to a group successfully', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue({ id: 'group-123' } as never);
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-1' } as never);
      vi.mocked(prisma.artistGroup.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.artistGroup.create).mockResolvedValue({
        id: 'ag-1',
        artistId: 'artist-1',
        groupId: 'group-123',
      } as never);

      const result = await GroupService.addGroupMember('group-123', 'artist-1');

      expect(result).toMatchObject({
        success: true,
        data: { id: 'ag-1', artistId: 'artist-1', groupId: 'group-123' },
      });
      expect(prisma.artistGroup.create).toHaveBeenCalledWith({
        data: {
          artistId: 'artist-1',
          groupId: 'group-123',
        },
      });
    });

    it('should return error when group not found', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue(null);

      const result = await GroupService.addGroupMember('non-existent', 'artist-1');

      expect(result).toMatchObject({ success: false, error: 'Group not found' });
    });

    it('should return error when artist not found', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue({ id: 'group-123' } as never);
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null);

      const result = await GroupService.addGroupMember('group-123', 'non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when artist is already a member', async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValue({ id: 'group-123' } as never);
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-1' } as never);
      vi.mocked(prisma.artistGroup.findUnique).mockResolvedValue({
        id: 'ag-1',
        artistId: 'artist-1',
        groupId: 'group-123',
      } as never);

      const result = await GroupService.addGroupMember('group-123', 'artist-1');

      expect(result).toMatchObject({
        success: false,
        error: 'Artist is already a member of this group',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.group.findUnique).mockRejectedValue(initError);

      const result = await GroupService.addGroupMember('group-123', 'artist-1');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.group.findUnique).mockRejectedValue(Error('Unknown error'));

      const result = await GroupService.addGroupMember('group-123', 'artist-1');

      expect(result).toMatchObject({ success: false, error: 'Failed to add artist to group' });
    });
  });

  // ===========================================================================
  // removeGroupMember
  // ===========================================================================

  describe('removeGroupMember', () => {
    it('should remove an artist from a group successfully', async () => {
      vi.mocked(prisma.artistGroup.delete).mockResolvedValue({
        id: 'ag-1',
        artistId: 'artist-1',
        groupId: 'group-123',
      } as never);

      const result = await GroupService.removeGroupMember('group-123', 'artist-1');

      expect(result).toMatchObject({ success: true, data: { id: 'ag-1' } });
      expect(prisma.artistGroup.delete).toHaveBeenCalledWith({
        where: {
          artistId_groupId: { artistId: 'artist-1', groupId: 'group-123' },
        },
      });
    });

    it('should return error when membership not found (P2025)', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.artistGroup.delete).mockRejectedValue(notFoundError);

      const result = await GroupService.removeGroupMember('group-123', 'artist-1');

      expect(result).toMatchObject({
        success: false,
        error: 'Artist is not a member of this group',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artistGroup.delete).mockRejectedValue(initError);

      const result = await GroupService.removeGroupMember('group-123', 'artist-1');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artistGroup.delete).mockRejectedValue(Error('Unknown error'));

      const result = await GroupService.removeGroupMember('group-123', 'artist-1');

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to remove artist from group',
      });
    });
  });

  // ===========================================================================
  // getGroupMembers
  // ===========================================================================

  describe('getGroupMembers', () => {
    const mockMembers = [
      {
        id: 'ag-1',
        artistId: 'artist-1',
        groupId: 'group-123',
        artist: {
          id: 'artist-1',
          firstName: 'John',
          surname: 'Doe',
          displayName: null,
        },
      },
      {
        id: 'ag-2',
        artistId: 'artist-2',
        groupId: 'group-123',
        artist: {
          id: 'artist-2',
          firstName: 'Jane',
          surname: 'Smith',
          displayName: 'J. Smith',
        },
      },
    ];

    it('should return group members successfully', async () => {
      vi.mocked(prisma.artistGroup.findMany).mockResolvedValue(mockMembers as never);

      const result = await GroupService.getGroupMembers('group-123');

      expect(result).toMatchObject({ success: true, data: mockMembers });
      expect(prisma.artistGroup.findMany).toHaveBeenCalledWith({
        where: { groupId: 'group-123' },
        include: {
          artist: {
            select: {
              id: true,
              firstName: true,
              surname: true,
              displayName: true,
            },
          },
        },
      });
    });

    it('should return empty array when group has no members', async () => {
      vi.mocked(prisma.artistGroup.findMany).mockResolvedValue([]);

      const result = await GroupService.getGroupMembers('group-123');

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artistGroup.findMany).mockRejectedValue(initError);

      const result = await GroupService.getGroupMembers('group-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artistGroup.findMany).mockRejectedValue(Error('Unknown error'));

      const result = await GroupService.getGroupMembers('group-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to get group members' });
    });
  });
});
