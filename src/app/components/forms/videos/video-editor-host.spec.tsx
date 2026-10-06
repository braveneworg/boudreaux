// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useSelectedLayoutSegment } from 'next/navigation';

import { act, render, screen } from '@testing-library/react';

import { VideoEditorHost } from './video-editor-host';

import type { VideoFormProps } from '../video-form';

vi.mock('next/navigation', () => ({ useSelectedLayoutSegment: vi.fn() }));

let mounts = 0;
let reportDraft: ((videoId: string) => void) | undefined;

vi.mock('../video-form', async () => {
  const { useEffect } = await import('react');
  return {
    VideoForm: ({ videoId, onDraftCreated }: VideoFormProps) => {
      useEffect(() => {
        mounts += 1;
      }, []);
      reportDraft = onDraftCreated;
      return <p>form for {videoId ?? 'a new video'}</p>;
    },
  };
});

const DRAFT = '6ac4fe4c99a66b41749eead2';

beforeEach(() => {
  mounts = 0;
  reportDraft = undefined;
});

describe('VideoEditorHost', () => {
  it('keeps the new-video form mounted when the route becomes its own draft', () => {
    vi.mocked(useSelectedLayoutSegment).mockReturnValue('new');
    const { rerender } = render(<VideoEditorHost />);
    expect(screen.getByText('form for a new video')).toBeInTheDocument();

    act(() => reportDraft?.(DRAFT));
    vi.mocked(useSelectedLayoutSegment).mockReturnValue(DRAFT);
    rerender(<VideoEditorHost />);

    expect(screen.getByText('form for a new video')).toBeInTheDocument();
    expect(mounts).toBe(1);
  });

  it('opens a fresh form for a video it did not create', () => {
    vi.mocked(useSelectedLayoutSegment).mockReturnValue('new');
    const { rerender } = render(<VideoEditorHost />);

    vi.mocked(useSelectedLayoutSegment).mockReturnValue(DRAFT);
    rerender(<VideoEditorHost />);

    expect(screen.getByText(`form for ${DRAFT}`)).toBeInTheDocument();
    expect(mounts).toBe(2);
  });
});
