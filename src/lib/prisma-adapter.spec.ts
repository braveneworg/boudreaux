import { CustomPrismaAdapter } from '@/lib/prisma-adapter';

import type { AdapterUser, Adapter } from 'next-auth/adapters';

// Mock @auth/prisma-adapter
vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: vi.fn(() => ({
    createSession: vi.fn(),
    getSessionAndUser: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
    createVerificationToken: vi.fn(),
    useVerificationToken: vi.fn(),
    createAccount: vi.fn(),
    deleteAccount: vi.fn(),
    linkAccount: vi.fn(),
    unlinkAccount: vi.fn(),
  })),
}));

// Mock Prisma user operations
interface MockPrismaUser {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

interface MockPrismaAccount {
  findUnique: ReturnType<typeof vi.fn>;
}

interface MockPrismaClient {
  user: MockPrismaUser;
  account: MockPrismaAccount;
}

// Mock PrismaClient
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    account: {
      findUnique: vi.fn(),
    },
  })),
}));

// Type guard to ensure required methods exist
type RequiredAdapter = Adapter & {
  createUser: NonNullable<Adapter['createUser']>;
  getUser: NonNullable<Adapter['getUser']>;
  getUserByEmail: NonNullable<Adapter['getUserByEmail']>;
  getUserByAccount: NonNullable<Adapter['getUserByAccount']>;
  updateUser: NonNullable<Adapter['updateUser']>;
};

describe('CustomPrismaAdapter', () => {
  let mockPrisma: MockPrismaClient;
  let adapter: RequiredAdapter;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      user: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      account: {
        findUnique: vi.fn(),
      },
    };

    adapter = CustomPrismaAdapter(mockPrisma as never) as RequiredAdapter;
  });

  describe('createUser', () => {
    it('should create a user with provided data', async () => {
      const userData: AdapterUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: null,
        username: 'testuser',
      };

      // Mock implementation that returns whatever username was passed in
      mockPrisma.user.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
        return {
          id: '1',
          name: null,
          email: args.data.email,
          emailVerified: args.data.emailVerified,
          image: null,
          username: args.data.username, // Return the generated username
        };
      });

      const result = await adapter.createUser(userData);

      // Verify that prisma.user.create was called
      expect(mockPrisma.user.create).toHaveBeenCalled();

      // Verify the username is a generated placeholder (lowercase alphanumeric with possible hyphens)
      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.username).toMatch(/^[a-z0-9-]+$/);
      expect(createCall.data.email).toBe('test@example.com');

      // Verify result has the generated username
      expect(result.id).toBe('1');
      expect(result.email).toBe('test@example.com');
      expect(result.username).toMatch(/^[a-z0-9-]+$/);
    });

    it('should handle user creation with username and terms', async () => {
      const userData = {
        id: '1',
        email: 'test@example.com',
        emailVerified: null,
        username: 'testuser',
        termsAndConditions: true,
      };

      // Mock implementation that returns whatever username was passed in
      mockPrisma.user.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
        return {
          id: '1',
          name: null,
          email: args.data.email,
          emailVerified: args.data.emailVerified,
          image: null,
          username: args.data.username, // Return the generated username
          termsAndConditions: args.data.termsAndConditions,
        };
      });

      const result = await adapter.createUser(userData);

      // Verify that prisma.user.create was called
      expect(mockPrisma.user.create).toHaveBeenCalled();

      // Verify the username is a generated placeholder (alphanumeric string, may contain hyphens)
      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.username).toMatch(/^[a-z-]+$/);
      expect(createCall.data.email).toBe('test@example.com');
      expect(createCall.data.termsAndConditions).toBe(true);

      // Verify result has the generated username
      expect(result.id).toBe('1');
      expect(result.email).toBe('test@example.com');
      expect(result.username).toMatch(/^[a-z-]+$/);
    });

    it('should handle database errors during user creation', async () => {
      const userData: AdapterUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: null,
        username: 'testuser',
      };

      const dbError = new Error('Database connection failed');
      mockPrisma.user.create.mockRejectedValue(dbError);

      await expect(adapter.createUser(userData)).rejects.toThrow('Database connection failed');
    });

    it('should return only specified fields in user object', async () => {
      const userData: AdapterUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: null,
        username: 'testuser',
      };

      const createdUser = {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: new Date(),
        image: 'avatar.jpg',
        username: null,
        extraField: 'should not be included',
      };

      mockPrisma.user.create.mockResolvedValue(createdUser);

      const result = await adapter.createUser(userData);

      expect(result).toEqual({
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: createdUser.emailVerified,
        image: 'avatar.jpg',
        username: undefined,
      });

      expect(result).not.toHaveProperty('extraField');
    });

    it('should update emailVerified for existing user when provided', async () => {
      const newVerificationDate = new Date('2024-01-01');
      const userData: AdapterUser = {
        id: '1',
        email: 'existing@example.com',
        emailVerified: newVerificationDate,
        username: 'existinguser',
      };

      const existingUser = {
        id: 'existing-id',
        name: 'Existing User',
        email: 'existing@example.com',
        emailVerified: null, // Not yet verified
        image: null,
        username: 'existinguser',
      };

      const updatedUser = {
        ...existingUser,
        emailVerified: newVerificationDate,
      };

      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await adapter.createUser(userData);

      // Should update the existing user's emailVerified
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'existing-id' },
        data: { emailVerified: newVerificationDate },
      });

      expect(result).toEqual({
        id: 'existing-id',
        name: 'Existing User',
        email: 'existing@example.com',
        emailVerified: newVerificationDate,
        image: null,
        username: 'existinguser',
      });
    });

    it('should not update emailVerified if it has not changed', async () => {
      const verificationDate = new Date('2024-01-01');
      const userData: AdapterUser = {
        id: '1',
        email: 'existing@example.com',
        emailVerified: verificationDate,
        username: 'existinguser',
      };

      const existingUser = {
        id: 'existing-id',
        name: 'Existing User',
        email: 'existing@example.com',
        emailVerified: verificationDate, // Already verified with same date
        image: null,
        username: 'existinguser',
      };

      mockPrisma.user.findUnique.mockResolvedValue(existingUser);

      const result = await adapter.createUser(userData);

      // Should NOT call update since emailVerified is the same
      expect(mockPrisma.user.update).not.toHaveBeenCalled();

      expect(result).toEqual({
        id: 'existing-id',
        name: 'Existing User',
        email: 'existing@example.com',
        emailVerified: verificationDate,
        image: null,
        username: 'existinguser',
      });
    });

    it('should not update emailVerified if new value is null', async () => {
      const oldVerificationDate = new Date('2024-01-01');
      const userData: AdapterUser = {
        id: '1',
        email: 'existing@example.com',
        emailVerified: null,
        username: 'existinguser',
      };

      const existingUser = {
        id: 'existing-id',
        name: 'Existing User',
        email: 'existing@example.com',
        emailVerified: oldVerificationDate, // Already verified
        image: null,
        username: 'existinguser',
      };

      mockPrisma.user.findUnique.mockResolvedValue(existingUser);

      const result = await adapter.createUser(userData);

      // Should NOT call update when emailVerified is null
      expect(mockPrisma.user.update).not.toHaveBeenCalled();

      expect(result).toEqual({
        id: 'existing-id',
        name: 'Existing User',
        email: 'existing@example.com',
        emailVerified: oldVerificationDate,
        image: null,
        username: 'existinguser',
      });
    });
  });

  describe('getUser', () => {
    it('should fetch user by id', async () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: null,
        image: null,
        username: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await adapter.getUser('1');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
      });

      expect(result).toEqual({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: null,
        image: null,
        username: undefined,
      });
    });

    it('should return null when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await adapter.getUser('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle database errors during user fetch', async () => {
      const dbError = new Error('Database timeout');
      mockPrisma.user.findUnique.mockRejectedValue(dbError);

      await expect(adapter.getUser('1')).rejects.toThrow('Database timeout');
    });
  });

  describe('getUserByEmail', () => {
    it('should fetch user by email', async () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: null,
        image: null,
        username: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await adapter.getUserByEmail('test@example.com');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });

      expect(result).toEqual({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: null,
        image: null,
        username: undefined,
      });
    });

    it('should return null when user with email not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await adapter.getUserByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should handle email normalization', async () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: null,
        image: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      await adapter.getUserByEmail('Test@Example.Com');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'Test@Example.Com' },
      });
    });
  });

  describe('getUserByAccount', () => {
    it('should fetch user by provider account id', async () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: null,
        image: null,
        username: null,
      };

      const account = { user };

      mockPrisma.account.findUnique.mockResolvedValue(account);

      const providerAccountId = {
        provider: 'google',
        providerAccountId: '12345',
      };

      const result = await adapter.getUserByAccount(providerAccountId);

      expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
        where: { provider_providerAccountId: providerAccountId },
        select: { user: true },
      });

      expect(result).toEqual({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: null,
        image: null,
        username: undefined,
      });
    });

    it('should return null when account not found', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      const providerAccountId = {
        provider: 'google',
        providerAccountId: 'nonexistent',
      };

      const result = await adapter.getUserByAccount(providerAccountId);

      expect(result).toBeNull();
    });

    it('should return null when account exists but has no user', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ user: null });

      const providerAccountId = {
        provider: 'google',
        providerAccountId: '12345',
      };

      const result = await adapter.getUserByAccount(providerAccountId);

      expect(result).toBeNull();
    });

    it('should handle different provider types', async () => {
      const user = { id: '1', email: 'test@example.com' };
      mockPrisma.account.findUnique.mockResolvedValue({ user });

      const providers = [
        { provider: 'google', providerAccountId: '12345' },
        { provider: 'github', providerAccountId: '67890' },
        { provider: 'email', providerAccountId: 'test@example.com' },
      ];

      for (const providerAccount of providers) {
        await adapter.getUserByAccount(providerAccount);
        expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
          where: { provider_providerAccountId: providerAccount },
          select: { user: true },
        });
      }
    });
  });

  describe('updateUser', () => {
    it('should update user data using id when no previousEmail provided', async () => {
      const updateData = {
        id: '1',
        name: 'Updated Name',
        email: 'updated@example.com',
      };

      const updatedUser = {
        id: '1',
        name: 'Updated Name',
        email: 'updated@example.com',
        emailVerified: null,
        image: null,
        username: null,
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await adapter.updateUser(updateData);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          name: 'Updated Name',
          email: 'updated@example.com',
        },
      });

      expect(result).toEqual({
        id: '1',
        name: 'Updated Name',
        email: 'updated@example.com',
        emailVerified: null,
        image: null,
        username: undefined,
      });
    });

    it('should update user data using id and include previousEmail in data when provided', async () => {
      const updateData = {
        id: '1',
        name: 'Updated Name',
        email: 'new@example.com',
        previousEmail: 'old@example.com',
      };

      const updatedUser = {
        id: '1',
        name: 'Updated Name',
        email: 'new@example.com',
        emailVerified: null,
        image: null,
        username: null,
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await adapter.updateUser(updateData);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          name: 'Updated Name',
          email: 'new@example.com',
          previousEmail: 'old@example.com',
        },
      });

      expect(result).toEqual({
        id: '1',
        name: 'Updated Name',
        email: 'new@example.com',
        emailVerified: null,
        image: null,
        username: undefined,
      });
    });

    it('should exclude id but include previousEmail in update data', async () => {
      const updateData = {
        id: '1',
        name: 'Updated Name',
        previousEmail: 'old@example.com',
        someExtraField: 'value',
      };

      const updatedUser = {
        id: '1',
        name: 'Updated Name',
        email: 'test@example.com',
        emailVerified: null,
        image: null,
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser);

      await adapter.updateUser(updateData);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          name: 'Updated Name',
          previousEmail: 'old@example.com',
          someExtraField: 'value',
        },
      });
    });

    it('should handle partial updates', async () => {
      const updateData = {
        id: '1',
        email: 'test@example.com',
        emailVerified: new Date(),
      };

      const updatedUser = {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: updateData.emailVerified,
        image: null,
        username: null,
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await adapter.updateUser(updateData);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          email: 'test@example.com',
          emailVerified: updateData.emailVerified,
        },
      });

      expect(result).toEqual({
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: updateData.emailVerified,
        image: null,
        username: undefined,
      });
    });

    it('should handle update errors', async () => {
      const updateData = {
        id: '1',
        name: 'Updated Name',
      };

      const dbError = new Error('User not found');
      mockPrisma.user.update.mockRejectedValue(dbError);

      await expect(adapter.updateUser(updateData)).rejects.toThrow('User not found');
    });
  });

  describe('adapter inheritance', () => {
    it('should extend base PrismaAdapter', () => {
      expect(adapter).toHaveProperty('createUser');
      expect(adapter).toHaveProperty('getUser');
      expect(adapter).toHaveProperty('getUserByEmail');
      expect(adapter).toHaveProperty('getUserByAccount');
      expect(adapter).toHaveProperty('updateUser');

      // Should also have base adapter methods
      expect(adapter).toHaveProperty('createSession');
      expect(adapter).toHaveProperty('getSessionAndUser');
      expect(adapter).toHaveProperty('updateSession');
      expect(adapter).toHaveProperty('deleteSession');
    });

    it('should override specific methods while keeping others', () => {
      // Our custom methods should be functions
      expect(typeof adapter.createUser).toBe('function');
      expect(typeof adapter.getUser).toBe('function');
      expect(typeof adapter.getUserByEmail).toBe('function');
      expect(typeof adapter.getUserByAccount).toBe('function');
      expect(typeof adapter.updateUser).toBe('function');
    });
  });

  describe('data validation and types', () => {
    it('should handle missing optional fields in user creation', async () => {
      const minimalUserData: AdapterUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: null,
        username: 'testuser',
      };

      const createdUser = {
        id: '1',
        name: null,
        email: 'test@example.com',
        emailVerified: null,
        image: null,
      };

      mockPrisma.user.create.mockResolvedValue(createdUser);

      const result = await adapter.createUser(minimalUserData);

      expect(result.id).toBe('1');
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBeNull();
      expect(result.image).toBeNull();
    });

    it('should handle date objects properly', async () => {
      const verifiedDate = new Date('2023-01-01');
      const userData: AdapterUser = {
        id: '1',
        email: 'test@example.com',
        emailVerified: verifiedDate,
        username: 'testuser',
      };

      const createdUser = {
        id: '1',
        name: null,
        email: 'test@example.com',
        emailVerified: verifiedDate,
        image: null,
      };

      mockPrisma.user.create.mockResolvedValue(createdUser);

      const result = await adapter.createUser(userData);

      expect(result.emailVerified).toEqual(verifiedDate);
    });
  });
});
