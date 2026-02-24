// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { GroupService } from '@/lib/services/group-service';

import { GET, POST as postHandler } from './route';

// Mock withAdmin decorator to bypass auth in tests
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: () => unknown) => handler,
}));

vi.mock('@/lib/services/group-service', () => ({
  GroupService: {
    getGroups: vi.fn(),
    createGroup: vi.fn(),
  },
}));

// Create POST reference after mocking
const POST = postHandler;

// Empty context for routes without dynamic params
const emptyContext = { params: Promise.resolve({}) };

describe('Group API Routes', () => {
  const mockGroup = {
    id: 'group-123',
    name: 'Test Group',
    displayName: 'Test Group Display',
    bio: 'A test group bio',
    shortBio: 'Short bio',
    formedOn: null,
    endedOn: null,
    publishedOn: null,
    deletedOn: null,
    createdBy: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/groups', () => {
    it('should return all groups with default parameters', async () => {
      const mockGroups = [mockGroup];
      vi.mocked(GroupService.getGroups).mockResolvedValue({
        success: true,
        data: mockGroups as never,
      });

      const request = new NextRequest('http://localhost:3000/api/groups');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        groups: mockGroups,
        count: 1,
      });
      expect(GroupService.getGroups).toHaveBeenCalledWith({});
    });

    it('should handle pagination parameters', async () => {
      vi.mocked(GroupService.getGroups).mockResolvedValue({
        success: true,
        data: [mockGroup] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/groups?skip=10&take=5');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(GroupService.getGroups).toHaveBeenCalledWith({
        skip: 10,
        take: 5,
      });
    });

    it('should handle search parameter', async () => {
      vi.mocked(GroupService.getGroups).mockResolvedValue({
        success: true,
        data: [mockGroup] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/groups?search=test');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(GroupService.getGroups).toHaveBeenCalledWith({
        search: 'test',
      });
    });

    it('should handle multiple query parameters', async () => {
      vi.mocked(GroupService.getGroups).mockResolvedValue({
        success: true,
        data: [mockGroup] as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/groups?skip=5&take=10&search=band'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(GroupService.getGroups).toHaveBeenCalledWith({
        skip: 5,
        take: 10,
        search: 'band',
      });
    });

    it('should return empty array when no groups found', async () => {
      vi.mocked(GroupService.getGroups).mockResolvedValue({
        success: true,
        data: [],
      });

      const request = new NextRequest('http://localhost:3000/api/groups');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        groups: [],
        count: 0,
      });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(GroupService.getGroups).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/groups');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(GroupService.getGroups).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve groups',
      });

      const request = new NextRequest('http://localhost:3000/api/groups');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve groups' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(GroupService.getGroups).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/groups');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should handle invalid numeric parameters gracefully', async () => {
      vi.mocked(GroupService.getGroups).mockResolvedValue({
        success: true,
        data: [mockGroup] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/groups?skip=invalid&take=abc');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(GroupService.getGroups).toHaveBeenCalledWith({
        skip: NaN,
        take: NaN,
      });
    });
  });

  describe('POST /api/groups', () => {
    it('should create a group successfully', async () => {
      vi.mocked(GroupService.createGroup).mockResolvedValue({
        success: true,
        data: mockGroup as never,
      });

      const request = new NextRequest('http://localhost:3000/api/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Group',
        }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual(mockGroup);
      expect(GroupService.createGroup).toHaveBeenCalledWith({
        name: 'Test Group',
      });
    });

    it('should return 400 when name is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/groups', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');
      expect(GroupService.createGroup).not.toHaveBeenCalled();
    });

    it('should return 400 when name is empty string', async () => {
      const request = new NextRequest('http://localhost:3000/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(GroupService.createGroup).not.toHaveBeenCalled();
    });

    it('should return 400 when name exceeds max length', async () => {
      const request = new NextRequest('http://localhost:3000/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: 'x'.repeat(201) }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(GroupService.createGroup).not.toHaveBeenCalled();
    });

    it('should accept additional optional fields', async () => {
      vi.mocked(GroupService.createGroup).mockResolvedValue({
        success: true,
        data: mockGroup as never,
      });

      const request = new NextRequest('http://localhost:3000/api/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Group',
          displayName: 'Test Group Display',
          bio: 'A test group bio',
          shortBio: 'Short bio',
        }),
      });

      const response = await POST(request, emptyContext);

      expect(response.status).toBe(201);
      expect(GroupService.createGroup).toHaveBeenCalledWith({
        name: 'Test Group',
        displayName: 'Test Group Display',
        bio: 'A test group bio',
        shortBio: 'Short bio',
      });
    });

    it('should return 400 when group name already exists', async () => {
      vi.mocked(GroupService.createGroup).mockResolvedValue({
        success: false,
        error: 'Group with this name already exists',
      });

      const request = new NextRequest('http://localhost:3000/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: 'Existing Group' }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Group with this name already exists' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(GroupService.createGroup).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Group' }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 400 for other service errors', async () => {
      vi.mocked(GroupService.createGroup).mockResolvedValue({
        success: false,
        error: 'Failed to create group',
      });

      const request = new NextRequest('http://localhost:3000/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Group' }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Failed to create group' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(GroupService.createGroup).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Group' }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });
});
