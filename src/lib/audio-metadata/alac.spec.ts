/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { writeAlacComment } from './alac';

const mockWriteTagViaFfmpeg = vi.fn();

vi.mock('./ffmpeg', () => ({
  writeTagViaFfmpeg: (...args: unknown[]) => mockWriteTagViaFfmpeg(...args),
}));

describe('writeAlacComment', () => {
  beforeEach(() => {
    mockWriteTagViaFfmpeg.mockResolvedValue(undefined);
  });

  it('should call writeTagViaFfmpeg with comment key for ALAC', async () => {
    await writeAlacComment('/tmp/track.m4a', 'Visit site.com');

    expect(mockWriteTagViaFfmpeg).toHaveBeenCalledWith(
      '/tmp/track.m4a',
      'comment',
      'Visit site.com'
    );
  });

  it('should propagate errors from writeTagViaFfmpeg', async () => {
    mockWriteTagViaFfmpeg.mockRejectedValue(new Error('ffmpeg failed'));

    await expect(writeAlacComment('/tmp/track.m4a', 'test')).rejects.toThrow('ffmpeg failed');
  });
});
