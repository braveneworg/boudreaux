/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { createRef, useRef } from 'react';

import { act, render, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useMediaUploaderFiles } from './use-media-uploader-files';

import type { MediaItem } from './media-uploader-types';

type MetadataOutcome = 'loaded' | 'error';

/**
 * Replaces `document.createElement` so the detached audio/video element the hook
 * builds to decode duration fires a deterministic outcome. The real element is
 * still returned (so it remains a genuine `HTMLElement`); only its `duration`
 * getter and `src` setter are overridden, the latter synchronously invoking
 * either `onloadedmetadata` (success) or `onerror` (failure) the way a real
 * element eventually would. The spy is returned so tests can assert which tag
 * was requested. Non-media tags fall through to the real implementation.
 */
const stubDurationDecoding = (outcome: MetadataOutcome, rawDuration: number) => {
  const realCreateElement = document.createElement.bind(document);

  return vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = realCreateElement(tagName);

    if (tagName === 'audio' || tagName === 'video') {
      Object.defineProperty(element, 'duration', {
        configurable: true,
        get: () => rawDuration,
      });
      Object.defineProperty(element, 'src', {
        configurable: true,
        get: () => '',
        set: () => {
          if (outcome === 'loaded') {
            element.onloadedmetadata?.(new Event('loadedmetadata'));
          } else {
            element.onerror?.(new Event('error'));
          }
        },
      });
    }

    return element;
  });
};

const buildExistingItem = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  id: 'existing-1',
  fileName: 'existing.mp3',
  fileSize: 1024,
  fileType: 'audio/mpeg',
  mediaType: 'audio',
  ...overrides,
});

const ACCEPTED_TYPES = ['audio/mpeg', 'video/mp4'];
const MAX_FILE_SIZE = 100 * 1024 * 1024;

type HookParams = Parameters<typeof useMediaUploaderFiles>[0];

const buildParams = (overrides: Partial<HookParams> = {}): HookParams => ({
  mediaItems: [],
  onMediaChange: vi.fn(),
  acceptedTypes: ACCEPTED_TYPES,
  maxFiles: 10,
  maxFileSize: MAX_FILE_SIZE,
  disabled: false,
  inputRef: createRef<HTMLInputElement>(),
  ...overrides,
});

/**
 * Uploads the given files into a real, hidden file input and returns the
 * resulting native `FileList`, giving tests a genuine `FileList` to feed
 * `handleFiles` without constructing one by hand (jsdom lacks `DataTransfer`).
 */
const uploadToFileList = async (files: File[]): Promise<FileList> => {
  let captured: FileList | null = null;
  const Capture = (): React.JSX.Element => (
    <input
      aria-label="capture"
      multiple
      onChange={(event) => {
        captured = event.target.files;
      }}
      type="file"
    />
  );

  const { getByLabelText, unmount } = render(<Capture />);
  await userEvent.upload(getByLabelText('capture'), files);
  unmount();

  if (!captured) {
    throw new Error('upload did not populate a FileList');
  }
  return captured;
};

describe('useMediaUploaderFiles', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleFiles', () => {
    it('does not call onMediaChange when files is null', async () => {
      const onMediaChange = vi.fn();
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams({ onMediaChange })));

      await act(async () => {
        await result.current.handleFiles(null);
      });

      expect(onMediaChange).not.toHaveBeenCalled();
    });

    it('does not call onMediaChange when disabled', async () => {
      const onMediaChange = vi.fn();
      const { result } = renderHook(() =>
        useMediaUploaderFiles(buildParams({ onMediaChange, disabled: true }))
      );
      const files = await uploadToFileList([new File(['x'], 'a.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange).not.toHaveBeenCalled();
    });

    it('does not call onMediaChange when no slots remain', async () => {
      const onMediaChange = vi.fn();
      const { result } = renderHook(() =>
        useMediaUploaderFiles(
          buildParams({ onMediaChange, maxFiles: 1, mediaItems: [buildExistingItem()] })
        )
      );
      const files = await uploadToFileList([new File(['x'], 'a.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange).not.toHaveBeenCalled();
    });

    it('preserves existing items ahead of the new one', async () => {
      stubDurationDecoding('loaded', 12);
      const onMediaChange = vi.fn();
      const existing = buildExistingItem();
      const { result } = renderHook(() =>
        useMediaUploaderFiles(buildParams({ onMediaChange, mediaItems: [existing] }))
      );
      const files = await uploadToFileList([new File(['x'], 'new.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0][0]).toBe(existing);
    });

    it('produces one new item for a single accepted file', async () => {
      stubDurationDecoding('loaded', 12);
      const onMediaChange = vi.fn();
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams({ onMediaChange })));
      const files = await uploadToFileList([new File(['x'], 'song.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0]).toHaveLength(1);
    });

    it('sets fileName from the selected file', async () => {
      stubDurationDecoding('loaded', 12);
      const onMediaChange = vi.fn();
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams({ onMediaChange })));
      const files = await uploadToFileList([new File(['x'], 'song.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0][0].fileName).toBe('song.mp3');
    });

    it('sets fileType from the selected file', async () => {
      stubDurationDecoding('loaded', 12);
      const onMediaChange = vi.fn();
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams({ onMediaChange })));
      const files = await uploadToFileList([new File(['x'], 'song.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0][0].fileType).toBe('audio/mpeg');
    });

    it('attaches the original File to the new item', async () => {
      stubDurationDecoding('loaded', 12);
      const onMediaChange = vi.fn();
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams({ onMediaChange })));
      const original = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });
      const files = await uploadToFileList([original]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0][0].fileName).toBe(original.name);
    });

    it('classifies an audio file as mediaType "audio"', async () => {
      stubDurationDecoding('loaded', 12);
      const onMediaChange = vi.fn();
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams({ onMediaChange })));
      const files = await uploadToFileList([new File(['x'], 'song.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0][0].mediaType).toBe('audio');
    });

    it('classifies a video file as mediaType "video"', async () => {
      stubDurationDecoding('loaded', 30);
      const onMediaChange = vi.fn();
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams({ onMediaChange })));
      const files = await uploadToFileList([new File(['x'], 'clip.mp4', { type: 'video/mp4' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0][0].mediaType).toBe('video');
    });

    it('rounds the decoded duration from loaded metadata', async () => {
      stubDurationDecoding('loaded', 42.4);
      const onMediaChange = vi.fn();
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams({ onMediaChange })));
      const files = await uploadToFileList([new File(['x'], 'song.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0][0].duration).toBe(42);
    });

    it('leaves duration undefined when metadata fails to load', async () => {
      stubDurationDecoding('error', 0);
      const onMediaChange = vi.fn();
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams({ onMediaChange })));
      const files = await uploadToFileList([new File(['x'], 'song.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0][0].duration).toBeUndefined();
    });

    it('revokes the object URL after metadata loads', async () => {
      stubDurationDecoding('loaded', 12);
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams()));
      const files = await uploadToFileList([new File(['x'], 'song.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it('revokes the object URL after a metadata error', async () => {
      stubDurationDecoding('error', 0);
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams()));
      const files = await uploadToFileList([new File(['x'], 'song.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it('creates a video element for video files', async () => {
      const createElementSpy = stubDurationDecoding('loaded', 30);
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams()));
      const files = await uploadToFileList([new File(['x'], 'clip.mp4', { type: 'video/mp4' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(createElementSpy).toHaveBeenCalledWith('video');
    });

    it('creates an audio element for audio files', async () => {
      const createElementSpy = stubDurationDecoding('loaded', 12);
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams()));
      const files = await uploadToFileList([new File(['x'], 'song.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(createElementSpy).toHaveBeenCalledWith('audio');
    });

    it('records an error for an unaccepted file type', async () => {
      const onMediaChange = vi.fn();
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams({ onMediaChange })));
      const files = await uploadToFileList([
        new File(['x'], 'doc.pdf', { type: 'application/pdf' }),
      ]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0][0].error).toBe(
        'Invalid file type. Accepted: audio and video files'
      );
    });

    it('skips duration decoding for an invalid file', async () => {
      const createElementSpy = stubDurationDecoding('loaded', 12);
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams()));
      const files = await uploadToFileList([
        new File(['x'], 'doc.pdf', { type: 'application/pdf' }),
      ]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(createElementSpy).not.toHaveBeenCalledWith('audio');
    });

    it('leaves duration undefined for an invalid file', async () => {
      const onMediaChange = vi.fn();
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams({ onMediaChange })));
      const files = await uploadToFileList([
        new File(['x'], 'doc.pdf', { type: 'application/pdf' }),
      ]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0][0].duration).toBeUndefined();
    });

    it('records a size error when the file exceeds the max size', async () => {
      const onMediaChange = vi.fn();
      const { result } = renderHook(() =>
        useMediaUploaderFiles(buildParams({ onMediaChange, maxFileSize: 1 }))
      );
      const files = await uploadToFileList([
        new File(['too-large'], 'big.mp3', { type: 'audio/mpeg' }),
      ]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0][0].error).toBe('File too large. Max size: 0MB');
    });

    it('leaves error undefined for a valid file', async () => {
      stubDurationDecoding('loaded', 12);
      const onMediaChange = vi.fn();
      const { result } = renderHook(() => useMediaUploaderFiles(buildParams({ onMediaChange })));
      const files = await uploadToFileList([new File(['x'], 'song.mp3', { type: 'audio/mpeg' })]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0][0].error).toBeUndefined();
    });

    it('caps the number of new items at the remaining slots', async () => {
      stubDurationDecoding('loaded', 12);
      const onMediaChange = vi.fn();
      const { result } = renderHook(() =>
        useMediaUploaderFiles(
          buildParams({ onMediaChange, maxFiles: 2, mediaItems: [buildExistingItem()] })
        )
      );
      const files = await uploadToFileList([
        new File(['a'], 'a.mp3', { type: 'audio/mpeg' }),
        new File(['b'], 'b.mp3', { type: 'audio/mpeg' }),
        new File(['c'], 'c.mp3', { type: 'audio/mpeg' }),
      ]);

      await act(async () => {
        await result.current.handleFiles(files);
      });

      expect(onMediaChange.mock.calls[0][0]).toHaveLength(2);
    });
  });

  describe('handleInputChange', () => {
    it('forwards the input files to handleFiles', async () => {
      stubDurationDecoding('loaded', 12);
      const onMediaChange = vi.fn();

      const Harness = (): React.JSX.Element => {
        const inputRef = useRef<HTMLInputElement>(null);
        const { handleInputChange } = useMediaUploaderFiles(
          buildParams({ onMediaChange, inputRef })
        );
        return <input aria-label="media" onChange={handleInputChange} type="file" ref={inputRef} />;
      };

      const { getByLabelText } = render(<Harness />);
      await userEvent.upload(
        getByLabelText('media'),
        new File(['x'], 'song.mp3', { type: 'audio/mpeg' })
      );

      expect(onMediaChange.mock.calls[0][0]).toHaveLength(1);
    });

    it('resets the input value to allow re-selecting the same file', async () => {
      const onMediaChange = vi.fn();

      const Harness = (): React.JSX.Element => {
        const inputRef = useRef<HTMLInputElement>(null);
        const { handleInputChange } = useMediaUploaderFiles(
          buildParams({ onMediaChange, inputRef })
        );
        return <input aria-label="media" onChange={handleInputChange} type="file" ref={inputRef} />;
      };

      const { getByLabelText } = render(<Harness />);
      const input = getByLabelText('media');
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('expected a file input');
      }
      await userEvent.upload(input, new File(['x'], 'song.mp3', { type: 'audio/mpeg' }));

      expect(input.value).toBe('');
    });

    it('does not throw when the input ref is null', async () => {
      stubDurationDecoding('loaded', 12);
      const onMediaChange = vi.fn();
      const inputRef = createRef<HTMLInputElement>();
      const { result } = renderHook(() =>
        useMediaUploaderFiles(buildParams({ onMediaChange, inputRef }))
      );
      const files = await uploadToFileList([new File(['x'], 'song.mp3', { type: 'audio/mpeg' })]);

      const Trigger = (): React.JSX.Element => (
        <input aria-label="trigger" onChange={result.current.handleInputChange} type="file" />
      );

      await act(async () => {
        await result.current.handleFiles(files);
      });

      render(<Trigger />);

      expect(inputRef.current).toBeNull();
    });
  });
});
