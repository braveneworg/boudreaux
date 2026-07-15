// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { PlaylistService } from '@/lib/services/playlist-service';
import type { PlaylistDetailResponse } from '@/lib/types/domain/playlist';

import { GET } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

vi.mock('@/lib/services/playlist-service', () => ({
  PlaylistService: {
    getOwnedOrPublicDetail: vi.fn(),
  },
}));

const VALID_ID = '507f1f77bcf86cd799439011';

const makeContext = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

const makeRequest = (id: string): NextRequest =>
  new NextRequest(`http://localhost:3000/api/playlists/${id}`);

describe('GET /api/playlists/[id]', () => {
  const mockDetail: PlaylistDetailResponse = {
    id: VALID_ID,
    title: 'Morning Mix',
    isPublic: true,
    isOwner: false,
    coverImages: ['https://cdn.example.com/cover.jpg'],
    itemCount: 1,
    totalDuration: 245,
    items: [
      {
        id: 'item-1',
        itemType: 'track',
        sortOrder: 0,
        title: 'Opening Song',
        artistName: 'The Artist',
        duration: 245,
        available: true,
        trackFileId: 'track-file-1',
        releaseId: 'release-1',
        releaseTitle: 'The Release',
        videoId: null,
        coverArt: 'https://cdn.example.com/art.jpg',
        s3Key: null,
        streamUrl: null,
        posterUrl: null,
      },
    ],
  };

  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    vi.mocked(PlaylistService.getOwnedOrPublicDetail).mockResolvedValue(mockDetail);
  });

  it('should return 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET(makeRequest(VALID_ID), makeContext(VALID_ID));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Authentication required' });
    expect(PlaylistService.getOwnedOrPublicDetail).not.toHaveBeenCalled();
  });

  it('should return 404 for a malformed ObjectId without calling the service', async () => {
    const response = await GET(makeRequest('not-an-object-id'), makeContext('not-an-object-id'));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'NOT_FOUND' });
    expect(PlaylistService.getOwnedOrPublicDetail).not.toHaveBeenCalled();
  });

  it('should return 404 when the playlist is missing or private and unowned', async () => {
    vi.mocked(PlaylistService.getOwnedOrPublicDetail).mockResolvedValue(null);

    const response = await GET(makeRequest(VALID_ID), makeContext(VALID_ID));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'NOT_FOUND' });
  });

  it('should return a public playlist to a non-owner with isOwner false', async () => {
    const response = await GET(makeRequest(VALID_ID), makeContext(VALID_ID));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockDetail);
    expect(PlaylistService.getOwnedOrPublicDetail).toHaveBeenCalledWith(VALID_ID, 'user-1');
  });

  it('should return the playlist to its owner with isOwner true', async () => {
    vi.mocked(PlaylistService.getOwnedOrPublicDetail).mockResolvedValue({
      ...mockDetail,
      isPublic: false,
      isOwner: true,
    });

    const response = await GET(makeRequest(VALID_ID), makeContext(VALID_ID));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ...mockDetail, isPublic: false, isOwner: true });
  });

  it('should include Cache-Control: private, no-store header on the response', async () => {
    const response = await GET(makeRequest(VALID_ID), makeContext(VALID_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('should return 500 when the service throws', async () => {
    vi.mocked(PlaylistService.getOwnedOrPublicDetail).mockRejectedValue(Error('DB error'));

    const response = await GET(makeRequest(VALID_ID), makeContext(VALID_ID));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });
});
