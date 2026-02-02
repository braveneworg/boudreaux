import { addGroupMemberAction, removeGroupMemberAction } from './group-member-actions';
import { auth } from '../../../auth';
import { GroupService } from '../services/group-service';
import { logSecurityEvent } from '../utils/audit-log';
import { error as logError } from '../utils/console-logger';

import type { Session } from 'next-auth';

// Mock auth
vi.mock('../../../auth', () => ({
  auth: vi.fn(),
}));

// Create a typed mock for auth
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

// Mock GroupService
vi.mock('../services/group-service', () => ({
  GroupService: {
    addGroupMember: vi.fn(),
    removeGroupMember: vi.fn(),
  },
}));

// Mock audit log
vi.mock('../utils/audit-log', () => ({
  logSecurityEvent: vi.fn(),
}));

// Mock console logger
vi.mock('../utils/console-logger', () => ({
  error: vi.fn(),
}));

// Helper to create a mock session with proper typing
const createMockSession = (userId: string | undefined): Session | null => {
  if (!userId) {
    return {
      user: {
        id: '',
        username: '',
        email: 'test@example.com',
      },
      expires: new Date().toISOString(),
    };
  }
  return {
    user: {
      id: userId,
      username: 'testuser',
      email: 'test@example.com',
    },
    expires: new Date().toISOString(),
  };
};

describe('group-member-actions', () => {
  const mockUserId = 'user-123';
  const mockGroupId = 'group-456';
  const mockArtistId = 'artist-789';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addGroupMemberAction', () => {
    it('returns error when user is not logged in', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await addGroupMemberAction(mockGroupId, mockArtistId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You must be logged in to add group members');
    });

    it('returns error when session has no user id', async () => {
      mockAuth.mockResolvedValue(createMockSession(undefined));

      const result = await addGroupMemberAction(mockGroupId, mockArtistId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You must be logged in to add group members');
    });

    it('successfully adds a member to a group', async () => {
      const mockMemberData = {
        id: 'member-1',
        artistId: mockArtistId,
        groupId: mockGroupId,
      };

      mockAuth.mockResolvedValue(createMockSession(mockUserId));

      vi.mocked(GroupService.addGroupMember).mockResolvedValue({
        success: true,
        data: mockMemberData,
      });

      const result = await addGroupMemberAction(mockGroupId, mockArtistId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMemberData);
      expect(GroupService.addGroupMember).toHaveBeenCalledWith(mockGroupId, mockArtistId);
      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.group.member.added',
        userId: mockUserId,
        metadata: {
          groupId: mockGroupId,
          artistId: mockArtistId,
          success: true,
        },
      });
    });

    it('returns error when service returns failure', async () => {
      mockAuth.mockResolvedValue(createMockSession(mockUserId));

      vi.mocked(GroupService.addGroupMember).mockResolvedValue({
        success: false,
        error: 'Artist already in group',
      });

      const result = await addGroupMemberAction(mockGroupId, mockArtistId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Artist already in group');
      expect(logSecurityEvent).not.toHaveBeenCalled();
    });

    it('returns fallback error when service returns success without data', async () => {
      mockAuth.mockResolvedValue(createMockSession(mockUserId));

      // Cast to allow testing edge case where data is missing despite success
      vi.mocked(GroupService.addGroupMember).mockResolvedValue({
        success: true,
        data: undefined as unknown as { id: string; artistId: string; groupId: string },
      });

      const result = await addGroupMemberAction(mockGroupId, mockArtistId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to add artist to group');
    });

    it('handles unexpected errors', async () => {
      mockAuth.mockResolvedValue(createMockSession(mockUserId));

      vi.mocked(GroupService.addGroupMember).mockRejectedValue(new Error('Database error'));

      const result = await addGroupMemberAction(mockGroupId, mockArtistId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('An unexpected error occurred');
      expect(logError).toHaveBeenCalledWith('Add group member action error:', expect.any(Error));
    });
  });

  describe('removeGroupMemberAction', () => {
    it('returns error when user is not logged in', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await removeGroupMemberAction(mockGroupId, mockArtistId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You must be logged in to remove group members');
    });

    it('returns error when session has no user id', async () => {
      mockAuth.mockResolvedValue(createMockSession(undefined));

      const result = await removeGroupMemberAction(mockGroupId, mockArtistId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You must be logged in to remove group members');
    });

    it('successfully removes a member from a group', async () => {
      mockAuth.mockResolvedValue(createMockSession(mockUserId));

      vi.mocked(GroupService.removeGroupMember).mockResolvedValue({
        success: true,
        data: { id: 'membership-id' },
      });

      const result = await removeGroupMemberAction(mockGroupId, mockArtistId);

      expect(result.success).toBe(true);
      expect(GroupService.removeGroupMember).toHaveBeenCalledWith(mockGroupId, mockArtistId);
      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.group.member.removed',
        userId: mockUserId,
        metadata: {
          groupId: mockGroupId,
          artistId: mockArtistId,
          success: true,
        },
      });
    });

    it('returns error when service returns failure', async () => {
      mockAuth.mockResolvedValue(createMockSession(mockUserId));

      vi.mocked(GroupService.removeGroupMember).mockResolvedValue({
        success: false,
        error: 'Artist not in group',
      });

      const result = await removeGroupMemberAction(mockGroupId, mockArtistId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Artist not in group');
      expect(logSecurityEvent).not.toHaveBeenCalled();
    });

    it('handles unexpected errors', async () => {
      mockAuth.mockResolvedValue(createMockSession(mockUserId));

      vi.mocked(GroupService.removeGroupMember).mockRejectedValue(new Error('Database error'));

      const result = await removeGroupMemberAction(mockGroupId, mockArtistId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('An unexpected error occurred');
      expect(logError).toHaveBeenCalledWith('Remove group member action error:', expect.any(Error));
    });

    it('returns undefined error when service failure has no error message', async () => {
      mockAuth.mockResolvedValue(createMockSession(mockUserId));

      vi.mocked(GroupService.removeGroupMember).mockResolvedValue({
        success: false,
        error: '',
      });

      const result = await removeGroupMemberAction(mockGroupId, mockArtistId);

      expect(result.success).toBe(false);
      // The ternary logic returns result.error when !result.success, which is empty string here
      expect(result.error).toBe('');
    });
  });
});
