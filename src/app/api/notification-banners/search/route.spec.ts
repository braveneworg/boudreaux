/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BannerNotificationService } from '@/lib/services/banner-notification-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, options) => ({ data, status: options?.status ?? 200 })),
  },
}));
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: vi.fn((handler) => handler),
}));
vi.mock('@/lib/services/banner-notification-service', () => ({
  BannerNotificationService: {
    searchNotifications: vi.fn(),
  },
}));

const createRequest = (params: Record<string, string> = {}): Request => {
  const url = new URL('http://localhost/api/notification-banners/search');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
};

describe('GET /api/notification-banners/search', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should search notifications with provided query and take', async () => {
    const mockNotifications = [
      { id: 'n-1', content: 'Test banner' },
      { id: 'n-2', content: 'Another test' },
    ];

    vi.mocked(BannerNotificationService.searchNotifications).mockResolvedValue({
      success: true,
      data: mockNotifications,
    } as never);

    const request = createRequest({ q: 'test', take: '10' });
    const response = await GET(request);

    expect(BannerNotificationService.searchNotifications).toHaveBeenCalledWith('test', 10);
    expect(response).toEqual({
      data: { notifications: mockNotifications },
      status: 200,
    });
  });

  it('should default to empty query and take of 20 when params are absent', async () => {
    vi.mocked(BannerNotificationService.searchNotifications).mockResolvedValue({
      success: true,
      data: [],
    } as never);

    const request = createRequest();
    const response = await GET(request);

    expect(BannerNotificationService.searchNotifications).toHaveBeenCalledWith('', 20);
    expect(response).toEqual({
      data: { notifications: [] },
      status: 200,
    });
  });

  it('should return 500 when service fails', async () => {
    vi.mocked(BannerNotificationService.searchNotifications).mockResolvedValue({
      success: false,
      error: 'Search failed',
    } as never);

    const request = createRequest({ q: 'test' });
    const response = await GET(request);

    expect(response).toEqual({
      data: { error: 'Search failed' },
      status: 500,
    });
  });

  it('should parse take as integer from string', async () => {
    vi.mocked(BannerNotificationService.searchNotifications).mockResolvedValue({
      success: true,
      data: [],
    } as never);

    const request = createRequest({ q: 'hello', take: '5' });
    await GET(request);

    expect(BannerNotificationService.searchNotifications).toHaveBeenCalledWith('hello', 5);
  });
});
