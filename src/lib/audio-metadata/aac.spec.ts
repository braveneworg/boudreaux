/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { writeAacComment } from './aac';

const mockWriteTagViaFfmpeg = vi.fn();

vi.mock('./ffmpeg', () => ({
  writeTagViaFfmpeg: (...args: unknown[]) => mockWriteTagViaFfmpeg(...args),
}));

describe('writeAacComment', () => {
  beforeEach(() => {
    mockWriteTagViaFfmpeg.mockResolvedValue(undefined);
  });

  it('should call writeTagViaFfmpeg with comment key for AAC', async () => {
    await writeAacComment('/tmp/track.m4a', 'Visit site.com');

    expect(mockWriteTagViaFfmpeg).toHaveBeenCalledWith(
      '/tmp/track.m4a',
      'comment',
      'Visit site.com'
    );
  });

  it('should propagate errors from writeTagViaFfmpeg', async () => {
    mockWriteTagViaFfmpeg.mockRejectedValue(new Error('ffmpeg failed'));

    await expect(writeAacComment('/tmp/track.m4a', 'test')).rejects.toThrow('ffmpeg failed');
  });
});
