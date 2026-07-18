/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { posterCandidateToFile, VideoPosterSection } from './video-poster-section';

import type { PosterCandidate } from './video-metadata';
import type { Control } from 'react-hook-form';

/** Build a candidate whose timestamp doubles as its accessible identity. */
const candidateAt = (atSeconds: number): PosterCandidate => ({
  blob: new Blob([`frame-${atSeconds}`], { type: 'image/jpeg' }),
  atSeconds,
  score: atSeconds,
});

interface HarnessProps {
  candidates?: PosterCandidate[];
  selectedIndex?: number;
  onSelectCandidate?: (index: number) => void;
  uploadedPosterUrl?: string | null;
  isUploading?: boolean;
  errorMessage?: string | null;
  uploadPoster?: (file: File) => Promise<void>;
  existingPosterUrl?: string;
}

// Renders the section with a real RHF control (so `posterUrl` can be watched)
// and fully-injected upload props — mirroring how VideoForm now wires it.
const Harness = ({
  candidates = [],
  selectedIndex = 0,
  onSelectCandidate = () => undefined,
  uploadedPosterUrl = null,
  isUploading = false,
  errorMessage = null,
  uploadPoster = async () => undefined,
  existingPosterUrl,
}: HarnessProps): React.ReactElement => {
  const form = useForm<VideoFormData>({
    defaultValues: { posterUrl: existingPosterUrl ?? '' } as Partial<VideoFormData>,
  });
  return (
    <VideoPosterSection
      control={form.control as Control<VideoFormData>}
      candidates={candidates}
      selectedIndex={selectedIndex}
      onSelectCandidate={onSelectCandidate}
      uploadedPosterUrl={uploadedPosterUrl}
      isUploading={isUploading}
      errorMessage={errorMessage}
      uploadPoster={uploadPoster}
    />
  );
};

beforeEach(() => {
  let urlCounter = 0;
  globalThis.URL.createObjectURL = vi.fn(() => `blob:candidate-${urlCounter++}`);
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('VideoPosterSection — candidate strip', () => {
  it('renders a radiogroup with one radio per candidate', async () => {
    render(<Harness candidates={[candidateAt(3.7), candidateAt(5.1), candidateAt(6.5)]} />);

    expect(
      await screen.findByRole('radiogroup', { name: 'Captured poster frames' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('renders no strip for a single candidate', () => {
    render(<Harness candidates={[candidateAt(3.7)]} />);

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('renders no strip when there are no candidates', () => {
    render(<Harness />);

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('marks the selected frame as checked', () => {
    render(<Harness candidates={[candidateAt(3.7), candidateAt(5.1)]} selectedIndex={1} />);

    expect(screen.getByRole('radio', { name: 'Frame at 5.1s', checked: true })).toBeInTheDocument();
  });

  it('calls onSelectCandidate with the clicked frame index', async () => {
    const onSelectCandidate = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        candidates={[candidateAt(3.7), candidateAt(5.1), candidateAt(6.5)]}
        onSelectCandidate={onSelectCandidate}
      />
    );

    await user.click(screen.getByRole('radio', { name: 'Frame at 6.5s' }));

    expect(onSelectCandidate).toHaveBeenCalledWith(2);
  });

  it('moves focus to the next frame with arrow-key navigation', async () => {
    // Selection-on-arrow-focus is Radix behavior jsdom can't reproduce (it
    // hinges on a document-level keydown listener + focus timing); per the
    // ui/radio-group spec, keyboard coverage asserts focus movement + Space.
    const user = userEvent.setup();
    render(<Harness candidates={[candidateAt(3.7), candidateAt(5.1)]} />);

    const radios = screen.getAllByRole('radio');
    radios[0].focus();
    await user.keyboard('{ArrowRight}');

    expect(radios[1]).toHaveFocus();
  });

  it('selects a focused frame with the Space key', async () => {
    const onSelectCandidate = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        candidates={[candidateAt(3.7), candidateAt(5.1)]}
        onSelectCandidate={onSelectCandidate}
      />
    );

    screen.getAllByRole('radio')[1].focus();
    await user.keyboard(' ');

    expect(onSelectCandidate).toHaveBeenCalledWith(1);
  });

  it('shows the selected candidate frame in the big preview', async () => {
    render(<Harness candidates={[candidateAt(3.7), candidateAt(5.1)]} selectedIndex={1} />);

    await waitFor(() =>
      expect(screen.getByAltText('Video poster')).toHaveAttribute('src', 'blob:candidate-1')
    );
  });

  it('hides the strip once a poster has been uploaded this session', () => {
    render(
      <Harness
        candidates={[candidateAt(3.7), candidateAt(5.1)]}
        uploadedPosterUrl="https://cdn.example.com/poster.jpg"
      />
    );

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('disables the frame radios while an upload is in flight', () => {
    render(<Harness candidates={[candidateAt(3.7), candidateAt(5.1)]} isUploading />);

    screen.getAllByRole('radio').forEach((radio) => expect(radio).toBeDisabled());
  });

  it('offers no Use this frame button — Save commits the selected frame', () => {
    render(<Harness candidates={[candidateAt(3.7), candidateAt(5.1)]} />);

    expect(screen.queryByRole('button', { name: 'Use this frame' })).not.toBeInTheDocument();
  });

  it('revokes every candidate object URL on unmount', () => {
    const { unmount } = render(<Harness candidates={[candidateAt(3.7), candidateAt(5.1)]} />);

    unmount();

    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:candidate-0');
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:candidate-1');
  });
});

describe('VideoPosterSection — props-injected upload', () => {
  it('calls the injected uploadPoster with a manually picked image', async () => {
    const uploadPoster = vi.fn<(file: File) => Promise<void>>(async () => undefined);
    const user = userEvent.setup();
    render(<Harness uploadPoster={uploadPoster} />);

    const image = new File(['png'], 'poster.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload a poster image'), image);

    await waitFor(() => expect(uploadPoster).toHaveBeenCalledWith(image));
  });

  it('shows the uploaded poster preview when uploadedPosterUrl is provided', () => {
    render(<Harness uploadedPosterUrl="https://cdn.example.com/poster.jpg" />);

    expect(screen.getByAltText('Video poster')).toHaveAttribute(
      'src',
      'https://cdn.example.com/poster.jpg'
    );
  });

  it('shows the existing poster preview when only posterUrl is set', () => {
    render(<Harness existingPosterUrl="https://cdn.example.com/existing.jpg" />);

    expect(screen.getByAltText('Video poster')).toHaveAttribute(
      'src',
      'https://cdn.example.com/existing.jpg'
    );
  });

  it('renders the injected error message inline', () => {
    render(<Harness errorMessage="presign boom" />);

    expect(screen.getByRole('alert')).toHaveTextContent('presign boom');
  });
});

describe('posterCandidateToFile', () => {
  it('wraps a candidate blob as a poster.jpg JPEG File', () => {
    const file = posterCandidateToFile(new Blob(['jpeg'], { type: 'image/jpeg' }));

    expect(file.name).toBe('poster.jpg');
    expect(file.type).toBe('image/jpeg');
  });
});
