// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { GroupService } from '@/lib/services/group-service';

import { GET, PATCH, DELETE } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/group-service', () => ({
  GroupService: {
    getGroupById: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
  },
}));

describe('Group by ID API Routes', () => {
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

  const createParams = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/groups/[id]', () => {
    it('should return a group by ID', async () => {
      vi.mocked(GroupService.getGroupById).mockResolvedValue({
        success: true,
        data: mockGroup as never,
      });

      const request = new NextRequest('http://localhost:3000/api/groups/group-123');
      const response = await GET(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockGroup);
      expect(GroupService.getGroupById).toHaveBeenCalledWith('group-123');
    });

    it('should return 404 when group not found', async () => {
      vi.mocked(GroupService.getGroupById).mockResolvedValue({
        success: false,
        error: 'Group not found',
      });

      const request = new NextRequest('http://localhost:3000/api/groups/non-existent');
      const response = await GET(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Group not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(GroupService.getGroupById).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/groups/group-123');
      const response = await GET(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(GroupService.getGroupById).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve group',
      });

      const request = new NextRequest('http://localhost:3000/api/groups/group-123');
      const response = await GET(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve group' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(GroupService.getGroupById).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/groups/group-123');
      const response = await GET(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });

  describe('PATCH /api/groups/[id]', () => {
    it('should update a group successfully', async () => {
      const updatedGroup = { ...mockGroup, name: 'Updated Group' };
      vi.mocked(GroupService.updateGroup).mockResolvedValue({
        success: true,
        data: updatedGroup as never,
      });

      const request = new NextRequest('http://localhost:3000/api/groups/group-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Group' }),
      });
      const response = await PATCH(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(updatedGroup);
      expect(GroupService.updateGroup).toHaveBeenCalledWith('group-123', {
        name: 'Updated Group',
      });
    });

    it('should return 400 when validation fails', async () => {
      const request = new NextRequest('http://localhost:3000/api/groups/group-123', {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'x'.repeat(201),
        }),
      });
      const response = await PATCH(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');
      expect(GroupService.updateGroup).not.toHaveBeenCalled();
    });

    it('should return 404 when group not found', async () => {
      vi.mocked(GroupService.updateGroup).mockResolvedValue({
        success: false,
        error: 'Group not found',
      });

      const request = new NextRequest('http://localhost:3000/api/groups/non-existent', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Group' }),
      });
      const response = await PATCH(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Group not found' });
    });

    it('should return 409 when group name already exists', async () => {
      vi.mocked(GroupService.updateGroup).mockResolvedValue({
        success: false,
        error: 'Group with this name already exists',
      });

      const request = new NextRequest('http://localhost:3000/api/groups/group-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Existing Group' }),
      });
      const response = await PATCH(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data).toEqual({ error: 'Group with this name already exists' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(GroupService.updateGroup).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/groups/group-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Group' }),
      });
      const response = await PATCH(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(GroupService.updateGroup).mockResolvedValue({
        success: false,
        error: 'Failed to update group',
      });

      const request = new NextRequest('http://localhost:3000/api/groups/group-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Group' }),
      });
      const response = await PATCH(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to update group' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(GroupService.updateGroup).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/groups/group-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Group' }),
      });
      const response = await PATCH(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should handle partial updates with single field', async () => {
      vi.mocked(GroupService.updateGroup).mockResolvedValue({
        success: true,
        data: { ...mockGroup, bio: 'Updated bio' } as never,
      });

      const request = new NextRequest('http://localhost:3000/api/groups/group-123', {
        method: 'PATCH',
        body: JSON.stringify({ bio: 'Updated bio' }),
      });
      const response = await PATCH(request, createParams('group-123'));

      expect(response.status).toBe(200);
      expect(GroupService.updateGroup).toHaveBeenCalledWith('group-123', {
        bio: 'Updated bio',
      });
    });
  });

  describe('DELETE /api/groups/[id]', () => {
    it('should delete a group successfully', async () => {
      vi.mocked(GroupService.deleteGroup).mockResolvedValue({
        success: true,
        data: mockGroup as never,
      });

      const request = new NextRequest('http://localhost:3000/api/groups/group-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ message: 'Group deleted successfully' });
      expect(GroupService.deleteGroup).toHaveBeenCalledWith('group-123');
    });

    it('should return 404 when group not found', async () => {
      vi.mocked(GroupService.deleteGroup).mockResolvedValue({
        success: false,
        error: 'Group not found',
      });

      const request = new NextRequest('http://localhost:3000/api/groups/non-existent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Group not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(GroupService.deleteGroup).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/groups/group-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(GroupService.deleteGroup).mockResolvedValue({
        success: false,
        error: 'Failed to delete group',
      });

      const request = new NextRequest('http://localhost:3000/api/groups/group-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to delete group' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(GroupService.deleteGroup).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/groups/group-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('group-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });
});
