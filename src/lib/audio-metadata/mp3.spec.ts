/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { writeMp3Comment } from './mp3';

const mockRead = vi.fn();
const mockUpdate = vi.fn();

vi.mock('node-id3', () => ({
  default: {
    read: (...args: unknown[]) => mockRead(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

describe('writeMp3Comment', () => {
  beforeEach(() => {
    mockRead.mockReturnValue({ title: 'Test Track', artist: 'Test Artist' });
    mockUpdate.mockReturnValue(true);
  });

  it('should read existing tags and merge comment', async () => {
    await writeMp3Comment('/tmp/track.mp3', 'Visit example.com');

    expect(mockRead).toHaveBeenCalledWith('/tmp/track.mp3');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Track',
        artist: 'Test Artist',
        comment: {
          language: 'eng',
          text: 'Visit example.com',
        },
      }),
      '/tmp/track.mp3'
    );
  });

  it('should use default language "eng" when not specified', async () => {
    await writeMp3Comment('/tmp/track.mp3', 'Hello');

    const updatedTags = mockUpdate.mock.calls[0][0];
    expect(updatedTags.comment.language).toBe('eng');
  });

  it('should use custom language when specified', async () => {
    await writeMp3Comment('/tmp/track.mp3', 'Bonjour', { language: 'fra' });

    const updatedTags = mockUpdate.mock.calls[0][0];
    expect(updatedTags.comment.language).toBe('fra');
  });

  it('should throw when node-id3 update returns non-true', async () => {
    mockUpdate.mockReturnValue(new Error('Write failed'));

    await expect(writeMp3Comment('/tmp/track.mp3', 'Hello')).rejects.toThrow(
      'node-id3 failed to write comment'
    );
  });

  it('should handle files with no existing tags', async () => {
    mockRead.mockReturnValue({});

    await writeMp3Comment('/tmp/track.mp3', 'Hello');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        comment: { language: 'eng', text: 'Hello' },
      }),
      '/tmp/track.mp3'
    );
  });

  it('should overwrite existing comment tag', async () => {
    mockRead.mockReturnValue({
      comment: { language: 'eng', text: 'Old comment' },
    });

    await writeMp3Comment('/tmp/track.mp3', 'New comment');

    const updatedTags = mockUpdate.mock.calls[0][0];
    expect(updatedTags.comment.text).toBe('New comment');
  });
});
