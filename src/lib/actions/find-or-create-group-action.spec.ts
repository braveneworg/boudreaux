/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  findOrCreateGroupAction,
  type FindOrCreateGroupOptions,
} from './find-or-create-group-action';
import { prisma } from '../prisma';
import { logSecurityEvent } from '../utils/audit-log';
import { requireRole } from '../utils/auth/require-role';

import type { Session } from 'next-auth';

// Mock server-only first to prevent errors from imported modules
vi.mock('server-only', () => ({}));

// Mock all dependencies
vi.mock('../prisma', () => ({
  prisma: {
    group: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    artistGroup: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/require-role');
vi.mock('next/cache');

const mockRequireRole = vi.mocked(requireRole);
const mockPrismaGroupFindFirst = vi.mocked(prisma.group.findFirst);
const mockPrismaGroupCreate = vi.mocked(prisma.group.create);
const mockPrismaArtistGroupFindUnique = vi.mocked(prisma.artistGroup.findUnique);
const mockPrismaArtistGroupCreate = vi.mocked(prisma.artistGroup.create);
const mockLogSecurityEvent = vi.mocked(logSecurityEvent);

describe('findOrCreateGroupAction', () => {
  const mockAdminSession: Session = {
    user: {
      id: 'user-123',
      role: 'admin',
      name: 'Test Admin',
      email: 'admin@test.com',
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(mockAdminSession as never);
  });

  describe('validation', () => {
    it('should reject empty group name', async () => {
      const result = await findOrCreateGroupAction('');

      expect(result).toEqual({
        success: false,
        error: 'Group name is required',
      });
    });

    it('should reject whitespace-only group name', async () => {
      const result = await findOrCreateGroupAction('   ');

      expect(result).toEqual({
        success: false,
        error: 'Group name is required',
      });
    });

    it('should require admin role', async () => {
      mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

      await expect(findOrCreateGroupAction('Test Group')).rejects.toThrow('Unauthorized');
    });
  });

  describe('finding existing groups', () => {
    it('should find existing group by name (case-insensitive)', async () => {
      mockPrismaGroupFindFirst.mockResolvedValue({
        id: 'group-123',
        name: 'The Beatles',
        displayName: 'The Beatles',
      } as never);

      const result = await findOrCreateGroupAction('THE BEATLES');

      expect(result).toEqual({
        success: true,
        groupId: 'group-123',
        groupName: 'The Beatles',
        created: false,
        artistGroupCreated: false,
      });

      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'media.group.found',
        userId: 'user-123',
        metadata: {
          groupId: 'group-123',
          groupName: 'The Beatles',
          searchedName: 'THE BEATLES',
          artistGroupCreated: false,
        },
      });
    });

    it('should find existing group by displayName (case-insensitive)', async () => {
      mockPrismaGroupFindFirst.mockResolvedValue({
        id: 'group-123',
        name: 'beatles',
        displayName: 'The Beatles',
      } as never);

      const result = await findOrCreateGroupAction('The Beatles');

      expect(result.groupName).toBe('The Beatles');
    });

    it('should use name when displayName is null', async () => {
      mockPrismaGroupFindFirst.mockResolvedValue({
        id: 'group-123',
        name: 'The Rolling Stones',
        displayName: null,
      } as never);

      const result = await findOrCreateGroupAction('The Rolling Stones');

      expect(result.groupName).toBe('The Rolling Stones');
    });

    it('should create ArtistGroup when artistId is provided for existing group', async () => {
      mockPrismaGroupFindFirst.mockResolvedValue({
        id: 'group-123',
        name: 'The Beatles',
        displayName: 'The Beatles',
      } as never);
      mockPrismaArtistGroupFindUnique.mockResolvedValue(null);
      mockPrismaArtistGroupCreate.mockResolvedValue({
        id: 'ag-123',
        artistId: 'artist-456',
        groupId: 'group-123',
      } as never);

      const options: FindOrCreateGroupOptions = { artistId: 'artist-456' };
      const result = await findOrCreateGroupAction('The Beatles', options);

      expect(result.artistGroupCreated).toBe(true);
      expect(mockPrismaArtistGroupCreate).toHaveBeenCalledWith({
        data: {
          artistId: 'artist-456',
          groupId: 'group-123',
        },
      });
    });

    it('should not duplicate ArtistGroup if it already exists', async () => {
      mockPrismaGroupFindFirst.mockResolvedValue({
        id: 'group-123',
        name: 'The Beatles',
        displayName: 'The Beatles',
      } as never);
      mockPrismaArtistGroupFindUnique.mockResolvedValue({
        id: 'ag-existing',
        artistId: 'artist-456',
        groupId: 'group-123',
      } as never);

      const options: FindOrCreateGroupOptions = { artistId: 'artist-456' };
      const result = await findOrCreateGroupAction('The Beatles', options);

      expect(result.artistGroupCreated).toBe(false);
      expect(mockPrismaArtistGroupCreate).not.toHaveBeenCalled();
    });
  });

  describe('creating new groups', () => {
    beforeEach(() => {
      mockPrismaGroupFindFirst.mockResolvedValue(null);
    });

    it('should create new group when none exists', async () => {
      mockPrismaGroupCreate.mockResolvedValue({
        id: 'new-group-123',
        name: 'New Band',
        displayName: 'New Band',
      } as never);

      const result = await findOrCreateGroupAction('New Band');

      expect(result).toEqual({
        success: true,
        groupId: 'new-group-123',
        groupName: 'New Band',
        created: true,
        artistGroupCreated: false,
      });

      expect(mockPrismaGroupCreate).toHaveBeenCalledWith({
        data: {
          name: 'New Band',
          displayName: 'New Band',
        },
      });

      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'media.group.created',
        userId: 'user-123',
        metadata: {
          groupId: 'new-group-123',
          groupName: 'New Band',
          source: 'bulk-upload',
          artistGroupCreated: false,
        },
      });
    });

    it('should create group with ArtistGroup when artistId provided', async () => {
      mockPrismaGroupCreate.mockResolvedValue({
        id: 'new-group-123',
        name: 'New Band',
        displayName: 'New Band',
      } as never);

      const options: FindOrCreateGroupOptions = { artistId: 'artist-456' };
      const result = await findOrCreateGroupAction('New Band', options);

      expect(result.artistGroupCreated).toBe(true);
      expect(mockPrismaGroupCreate).toHaveBeenCalledWith({
        data: {
          name: 'New Band',
          displayName: 'New Band',
          artistGroups: {
            create: {
              artistId: 'artist-456',
            },
          },
        },
      });
    });

    it('should trim whitespace from group name', async () => {
      mockPrismaGroupCreate.mockResolvedValue({
        id: 'new-group-123',
        name: 'Trimmed Band',
        displayName: 'Trimmed Band',
      } as never);

      await findOrCreateGroupAction('  Trimmed Band  ');

      expect(mockPrismaGroupCreate).toHaveBeenCalledWith({
        data: {
          name: 'Trimmed Band',
          displayName: 'Trimmed Band',
        },
      });
    });
  });

  describe('transaction support', () => {
    it('should use provided transaction client', async () => {
      const mockTx = {
        group: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: 'new-group-123',
            name: 'Test Group',
            displayName: 'Test Group',
          }),
        },
        artistGroup: {
          findUnique: vi.fn(),
          create: vi.fn(),
        },
      };

      const options: FindOrCreateGroupOptions = { tx: mockTx as never };
      await findOrCreateGroupAction('Test Group', options);

      expect(mockTx.group.findFirst).toHaveBeenCalled();
      expect(mockTx.group.create).toHaveBeenCalled();
      expect(mockPrismaGroupFindFirst).not.toHaveBeenCalled();
      expect(mockPrismaGroupCreate).not.toHaveBeenCalled();
    });

    it('should use transaction client for ArtistGroup operations', async () => {
      const mockTx = {
        group: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'group-123',
            name: 'Existing Group',
            displayName: 'Existing Group',
          }),
          create: vi.fn(),
        },
        artistGroup: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: 'ag-123',
            artistId: 'artist-456',
            groupId: 'group-123',
          }),
        },
      };

      const options: FindOrCreateGroupOptions = {
        tx: mockTx as never,
        artistId: 'artist-456',
      };
      await findOrCreateGroupAction('Existing Group', options);

      expect(mockTx.artistGroup.findUnique).toHaveBeenCalled();
      expect(mockTx.artistGroup.create).toHaveBeenCalled();
      expect(mockPrismaArtistGroupFindUnique).not.toHaveBeenCalled();
      expect(mockPrismaArtistGroupCreate).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrismaGroupFindFirst.mockRejectedValue(new Error('Database connection failed'));

      const result = await findOrCreateGroupAction('Test Group');

      expect(result).toEqual({
        success: false,
        error: 'Failed to find or create group',
      });
    });

    it('should handle unknown errors', async () => {
      mockPrismaGroupFindFirst.mockRejectedValue('Unknown error');

      const result = await findOrCreateGroupAction('Test Group');

      expect(result).toEqual({
        success: false,
        error: 'Failed to find or create group',
      });
    });

    it('should handle group creation errors', async () => {
      mockPrismaGroupFindFirst.mockResolvedValue(null);
      mockPrismaGroupCreate.mockRejectedValue(new Error('Failed to create group'));

      const result = await findOrCreateGroupAction('New Group');

      expect(result).toEqual({
        success: false,
        error: 'Failed to find or create group',
      });
    });
  });

  describe('logging', () => {
    it('should log found event with correct metadata', async () => {
      mockPrismaGroupFindFirst.mockResolvedValue({
        id: 'group-123',
        name: 'Found Group',
        displayName: 'Found Group',
      } as never);

      await findOrCreateGroupAction('found group', { artistId: 'artist-456' });

      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'media.group.found',
        userId: 'user-123',
        metadata: {
          groupId: 'group-123',
          groupName: 'Found Group',
          searchedName: 'found group',
          artistGroupCreated: expect.anything(),
        },
      });
    });

    it('should log created event with correct metadata', async () => {
      mockPrismaGroupFindFirst.mockResolvedValue(null);
      mockPrismaGroupCreate.mockResolvedValue({
        id: 'new-group-123',
        name: 'Created Group',
        displayName: 'Created Group',
      } as never);

      await findOrCreateGroupAction('Created Group', { artistId: 'artist-456' });

      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'media.group.created',
        userId: 'user-123',
        metadata: {
          groupId: 'new-group-123',
          groupName: 'Created Group',
          source: 'bulk-upload',
          artistGroupCreated: true,
        },
      });
    });
  });
});
