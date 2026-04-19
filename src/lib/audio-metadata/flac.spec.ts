/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { writeFlacComment } from './flac';

const mockWriteTagViaFfmpeg = vi.fn();

vi.mock('./ffmpeg', () => ({
  writeTagViaFfmpeg: (...args: unknown[]) => mockWriteTagViaFfmpeg(...args),
}));

describe('writeFlacComment', () => {
  beforeEach(() => {
    mockWriteTagViaFfmpeg.mockResolvedValue(undefined);
  });

  it('should call writeTagViaFfmpeg with COMMENT key', async () => {
    await writeFlacComment('/tmp/track.flac', 'Mastered 2024');

    expect(mockWriteTagViaFfmpeg).toHaveBeenCalledWith(
      '/tmp/track.flac',
      'COMMENT',
      'Mastered 2024'
    );
  });

  it('should propagate errors from writeTagViaFfmpeg', async () => {
    mockWriteTagViaFfmpeg.mockRejectedValue(new Error('ffmpeg failed'));

    await expect(writeFlacComment('/tmp/track.flac', 'test')).rejects.toThrow('ffmpeg failed');
  });
});
