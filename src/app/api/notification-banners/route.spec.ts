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
vi.mock('@/lib/services/banner-notification-service', () => ({
  BannerNotificationService: {
    getActiveBanners: vi.fn(),
  },
}));

describe('GET /api/notification-banners', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return banners and rotationInterval on success', async () => {
    const mockResponse = {
      banners: [
        { slotNumber: 1, imageFilename: 'banner1.webp', notification: null },
        { slotNumber: 2, imageFilename: 'banner2.webp', notification: null },
      ],
      rotationInterval: 5,
    };

    vi.mocked(BannerNotificationService.getActiveBanners).mockResolvedValue({
      success: true,
      data: mockResponse,
    } as never);

    const response = await GET();

    expect(BannerNotificationService.getActiveBanners).toHaveBeenCalled();
    expect(response).toEqual({
      data: mockResponse,
      status: 200,
    });
  });

  it('should return 500 when service fails', async () => {
    vi.mocked(BannerNotificationService.getActiveBanners).mockResolvedValue({
      success: false,
      error: 'Database error',
    } as never);

    const response = await GET();

    expect(response).toEqual({
      data: { error: 'Database error' },
      status: 500,
    });
  });

  it('should return empty banners array with rotationInterval when no active banners exist', async () => {
    const mockResponse = {
      banners: [],
      rotationInterval: 5,
    };

    vi.mocked(BannerNotificationService.getActiveBanners).mockResolvedValue({
      success: true,
      data: mockResponse,
    } as never);

    const response = await GET();

    expect(response).toEqual({
      data: mockResponse,
      status: 200,
    });
  });
});
