/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { writeOggComment } from './ogg';

const mockWriteTagViaFfmpeg = vi.fn();

vi.mock('./ffmpeg', () => ({
  writeTagViaFfmpeg: (...args: unknown[]) => mockWriteTagViaFfmpeg(...args),
}));

describe('writeOggComment', () => {
  beforeEach(() => {
    mockWriteTagViaFfmpeg.mockResolvedValue(undefined);
  });

  it('should call writeTagViaFfmpeg with COMMENT key', async () => {
    await writeOggComment('/tmp/track.ogg', 'Visit site.com');

    expect(mockWriteTagViaFfmpeg).toHaveBeenCalledWith(
      '/tmp/track.ogg',
      'COMMENT',
      'Visit site.com'
    );
  });

  it('should propagate errors from writeTagViaFfmpeg', async () => {
    mockWriteTagViaFfmpeg.mockRejectedValue(new Error('ffmpeg failed'));

    await expect(writeOggComment('/tmp/track.ogg', 'test')).rejects.toThrow('ffmpeg failed');
  });
});
