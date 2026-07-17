/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen } from '@testing-library/react';

import { VideoArtistReviewSection } from './video-artist-review-section';

import type { VideoArtistReviewEntry } from './use-video-artist-review';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MATCHED_ENTRY: VideoArtistReviewEntry = {
  sourceName: 'Jane Doe',
  role: 'primary',
  status: 'matched',
  match: {
    id: 'artist-1',
    displayName: 'Jane Doe',
    firstName: 'Jane',
    surname: 'Doe',
  },
  draft: null,
};

const MATCHED_ENTRY_NO_DISPLAY_NAME: VideoArtistReviewEntry = {
  sourceName: 'Bob Smith',
  role: 'featured',
  status: 'matched',
  match: {
    id: 'artist-2',
    displayName: null,
    firstName: 'Bob',
    surname: 'Smith',
  },
  draft: null,
};

const NEW_ENTRY: VideoArtistReviewEntry = {
  sourceName: 'Zora Quill Brandt',
  role: 'primary',
  status: 'new',
  match: null,
  draft: {
    firstName: 'Zora',
    middleName: 'Quill',
    surname: 'Brandt',
    displayName: 'Zora Quill Brandt',
  },
};

// ── Test 1: empty entries renders nothing ──────────────────────────────────────

describe('VideoArtistReviewSection — empty entries', () => {
  it('renders nothing when entries is empty and there are no split parts', () => {
    const { container } = render(
      <VideoArtistReviewSection
        entries={[]}
        updateDraft={vi.fn()}
        primarySplitParts={null}
        onApplySplit={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

// ── Test 1b: primary-split hint ────────────────────────────────────────────────

describe('VideoArtistReviewSection — primary split hint', () => {
  it('renders a hint card with the joined split candidates', () => {
    render(
      <VideoArtistReviewSection
        entries={[NEW_ENTRY]}
        updateDraft={vi.fn()}
        primarySplitParts={['Alpha', 'Bravo']}
        onApplySplit={vi.fn()}
      />
    );

    const hint = screen.getByRole('note');
    expect(hint).toHaveTextContent('Multiple artists? Split as Alpha + Bravo');
  });

  it('calls onApplySplit with the parts when Apply split is clicked', () => {
    const onApplySplit = vi.fn();
    render(
      <VideoArtistReviewSection
        entries={[NEW_ENTRY]}
        updateDraft={vi.fn()}
        primarySplitParts={['Alpha', 'Bravo']}
        onApplySplit={onApplySplit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /apply split/i }));

    expect(onApplySplit).toHaveBeenCalledWith(['Alpha', 'Bravo']);
  });

  it('renders no hint card when primarySplitParts is null', () => {
    render(
      <VideoArtistReviewSection
        entries={[NEW_ENTRY]}
        updateDraft={vi.fn()}
        primarySplitParts={null}
        onApplySplit={vi.fn()}
      />
    );

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('renders the hint even when there are no entries', () => {
    render(
      <VideoArtistReviewSection
        entries={[]}
        updateDraft={vi.fn()}
        primarySplitParts={['Alpha', 'Bravo']}
        onApplySplit={vi.fn()}
      />
    );

    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});

// ── Test 2: matched entry ─────────────────────────────────────────────────────

describe('VideoArtistReviewSection — matched entry', () => {
  it('shows chip text "Links to existing artist Jane Doe" with a link to the artist page', () => {
    render(
      <VideoArtistReviewSection
        entries={[MATCHED_ENTRY]}
        updateDraft={vi.fn()}
        primarySplitParts={null}
        onApplySplit={vi.fn()}
      />
    );

    expect(screen.getByText(/links to existing artist jane doe/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /links to existing artist jane doe/i })
    ).toHaveAttribute('href', '/admin/artists/artist-1');
  });

  it('falls back to "First Surname" when displayName is null', () => {
    render(
      <VideoArtistReviewSection
        entries={[MATCHED_ENTRY_NO_DISPLAY_NAME]}
        updateDraft={vi.fn()}
        primarySplitParts={null}
        onApplySplit={vi.fn()}
      />
    );

    expect(screen.getByText(/links to existing artist bob smith/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /links to existing artist bob smith/i })
    ).toHaveAttribute('href', '/admin/artists/artist-2');
  });
});

// ── Test 3: new entry inputs prefilled + updateDraft called on change ─────────

describe('VideoArtistReviewSection — new entry', () => {
  it('renders four inputs prefilled from the draft', () => {
    render(
      <VideoArtistReviewSection
        entries={[NEW_ENTRY]}
        updateDraft={vi.fn()}
        primarySplitParts={null}
        onApplySplit={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue('Zora')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Quill')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Brandt')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Zora Quill Brandt')).toBeInTheDocument();
  });

  it('calls updateDraft with the sourceName and { middleName } when the middle name input changes', () => {
    const updateDraft = vi.fn();
    render(
      <VideoArtistReviewSection
        entries={[NEW_ENTRY]}
        updateDraft={updateDraft}
        primarySplitParts={null}
        onApplySplit={vi.fn()}
      />
    );

    const middleInput = screen.getByRole('textbox', { name: /middle name/i });
    fireEvent.change(middleInput, { target: { value: 'Q.' } });

    expect(updateDraft).toHaveBeenCalledWith('Zora Quill Brandt', { middleName: 'Q.' });
  });
});

// ── Test 4: labels programmatically associated ────────────────────────────────

describe('VideoArtistReviewSection — label association', () => {
  it('makes all four inputs accessible by role + name', () => {
    render(
      <VideoArtistReviewSection
        entries={[NEW_ENTRY]}
        updateDraft={vi.fn()}
        primarySplitParts={null}
        onApplySplit={vi.fn()}
      />
    );

    expect(screen.getByRole('textbox', { name: /first name/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /middle name/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /surname/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /display name/i })).toBeInTheDocument();
  });
});
