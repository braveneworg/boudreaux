import { requireRole } from './require-role';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock auth
const mockAuth = vi.fn();
vi.mock('../../../../auth', () => ({
  auth: () => mockAuth(),
}));

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when user has required role', () => {
    it('should resolve successfully for admin role', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1', role: 'admin' },
      });

      await expect(requireRole('admin')).resolves.toEqual({ user: { id: '1', role: 'admin' } });
    });

    it('should resolve successfully for user role', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1', role: 'user' },
      });

      await expect(requireRole('user')).resolves.toEqual({ user: { id: '1', role: 'user' } });
    });
  });

  describe('when user does not have required role', () => {
    it('should throw Unauthorized when user has different role', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1', role: 'user' },
      });

      await expect(requireRole('admin')).rejects.toThrow('Unauthorized');
    });

    it('should throw Unauthorized when user role is undefined', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1' },
      });

      await expect(requireRole('admin')).rejects.toThrow('Unauthorized');
    });
  });

  describe('when session is invalid', () => {
    it('should throw Unauthorized when session is null', async () => {
      mockAuth.mockResolvedValue(null);

      await expect(requireRole('admin')).rejects.toThrow('Unauthorized');
    });

    it('should throw Unauthorized when user is null', async () => {
      mockAuth.mockResolvedValue({ user: null });

      await expect(requireRole('admin')).rejects.toThrow('Unauthorized');
    });

    it('should throw Unauthorized when user is undefined', async () => {
      mockAuth.mockResolvedValue({});

      await expect(requireRole('admin')).rejects.toThrow('Unauthorized');
    });

    it('should throw error when user.id is missing', async () => {
      mockAuth.mockResolvedValue({
        user: { role: 'admin' },
      });

      await expect(requireRole('admin')).rejects.toThrow(
        'Invalid session: user ID missing. User ID is required for audit logging and security tracking.'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle case-sensitive role comparison', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1', role: 'Admin' },
      });

      // 'Admin' !== 'admin'
      await expect(requireRole('admin')).rejects.toThrow('Unauthorized');
    });

    it('should throw Unauthorized for empty role string when user has a role', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1', role: 'admin' },
      });

      // Empty string '' !== 'admin'
      await expect(requireRole('')).rejects.toThrow('Unauthorized');
    });

    it('should throw Unauthorized for empty role string when user has empty role', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1', role: '' },
      });

      // Empty string check: !'' is true, so it throws
      await expect(requireRole('')).rejects.toThrow('Unauthorized');
    });
  });
});
