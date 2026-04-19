/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { writeAiffComment } from './aiff';

const mockWriteTagViaFfmpeg = vi.fn();

vi.mock('./ffmpeg', () => ({
  writeTagViaFfmpeg: (...args: unknown[]) => mockWriteTagViaFfmpeg(...args),
}));

describe('writeAiffComment', () => {
  beforeEach(() => {
    mockWriteTagViaFfmpeg.mockResolvedValue(undefined);
  });

  it('should call writeTagViaFfmpeg with comment key', async () => {
    await writeAiffComment('/tmp/track.aiff', 'Visit https://example.com');

    expect(mockWriteTagViaFfmpeg).toHaveBeenCalledWith(
      '/tmp/track.aiff',
      'comment',
      'Visit https://example.com'
    );
  });

  it('should propagate errors from writeTagViaFfmpeg', async () => {
    mockWriteTagViaFfmpeg.mockRejectedValue(new Error('ffmpeg failed'));

    await expect(writeAiffComment('/tmp/track.aiff', 'test')).rejects.toThrow('ffmpeg failed');
  });
});
