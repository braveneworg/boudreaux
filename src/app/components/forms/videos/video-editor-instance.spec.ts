/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  followEditorSegment,
  initialEditorInstance,
  recordEditorDraft,
} from './video-editor-instance';

const DRAFT = '6ac4fe4c99a66b41749eead2';
const OTHER = '6ac4fe4c99a66b41749eead3';

describe('initialEditorInstance', () => {
  it('opens a new video on the new segment', () => {
    expect(initialEditorInstance('new')).toMatchObject({ videoId: undefined, draftId: null });
  });

  it('opens the video an id segment names', () => {
    expect(initialEditorInstance(OTHER)).toMatchObject({ videoId: OTHER });
  });
});

describe('followEditorSegment', () => {
  it('keeps the instance while the segment is unchanged', () => {
    const instance = initialEditorInstance('new');

    expect(followEditorSegment(instance, 'new')).toBe(instance);
  });

  it("keeps the same form when the router catches up with the form's own draft", () => {
    const drafted = recordEditorDraft(initialEditorInstance('new'), DRAFT);

    const followed = followEditorSegment(drafted, DRAFT);

    expect(followed).toMatchObject({ key: drafted.key, videoId: undefined, segment: DRAFT });
  });

  it('opens a fresh form for any other video', () => {
    const drafted = recordEditorDraft(initialEditorInstance('new'), DRAFT);

    const followed = followEditorSegment(drafted, OTHER);

    expect(followed.key).not.toBe(drafted.key);
    expect(followed).toMatchObject({ videoId: OTHER, draftId: null });
  });

  it('opens a fresh new-video form after a draft', () => {
    const atDraft = followEditorSegment(
      recordEditorDraft(initialEditorInstance('new'), DRAFT),
      DRAFT
    );

    const followed = followEditorSegment(atDraft, 'new');

    expect(followed.key).not.toBe(atDraft.key);
    expect(followed).toMatchObject({ videoId: undefined, draftId: null });
  });

  it('opens a fresh form when an edit form navigates to another video', () => {
    const editing = initialEditorInstance(OTHER);

    expect(followEditorSegment(editing, DRAFT).key).not.toBe(editing.key);
  });
});
