/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Form } from '@/app/components/ui/form';
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';

import { ReleaseNotesField } from './release-notes-field';
import { useReleaseNotesLookupQuery } from '../_hooks/use-release-notes-lookup-query';

import type { UseFormSetValue } from 'react-hook-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../_hooks/use-release-notes-lookup-query', () => ({
  useReleaseNotesLookupQuery: vi.fn(),
}));

type SetValueRef = React.MutableRefObject<UseFormSetValue<ReleaseFormData> | null>;

interface WrapperProps {
  setValueRef: SetValueRef;
  artistName?: string | null;
}

const Wrapper = ({ setValueRef, artistName = 'Ceschi' }: WrapperProps): React.ReactElement => {
  const form = useForm<ReleaseFormData>({
    defaultValues: {
      title: '',
      notes: '',
      releasedOn: '',
      catalogNumber: '',
      formats: [],
    },
  });

  setValueRef.current = form.setValue;

  return (
    <Form {...form}>
      <ReleaseNotesField control={form.control} setValue={form.setValue} artistName={artistName} />
    </Form>
  );
};

const makeSetValueRef = (): SetValueRef => ({ current: null });

/** Render and push a full, generation-ready release into the form. */
const renderReady = (artistName: string | null = 'Ceschi'): SetValueRef => {
  const setValueRef = makeSetValueRef();
  render(<Wrapper setValueRef={setValueRef} artistName={artistName} />);
  act(() => {
    setValueRef.current?.('title', 'Broken Bone Ballads');
    setValueRef.current?.('releasedOn', '2015-03-03');
    setValueRef.current?.('catalogNumber', 'FF4-042');
    setValueRef.current?.('formats', ['VINYL_12_INCH']);
  });
  return setValueRef;
};

const mockLookup = (overrides: Record<string, unknown> = {}): void => {
  vi.mocked(useReleaseNotesLookupQuery).mockReturnValue({
    isFetching: false,
    error: undefined,
    data: undefined,
    refetch: vi.fn().mockResolvedValue({ data: undefined }),
    ...overrides,
  } as unknown as ReturnType<typeof useReleaseNotesLookupQuery>);
};

const generateButton = () => screen.getByRole('button', { name: 'Generate notes' });

describe('ReleaseNotesField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookup();
  });

  it('renders the notes textarea with a generate button', () => {
    renderReady();

    expect(screen.getByLabelText('Release Notes')).toBeInTheDocument();
    expect(generateButton()).toBeEnabled();
  });

  it('disables the button without a title', () => {
    render(<Wrapper setValueRef={makeSetValueRef()} />);

    expect(generateButton()).toBeDisabled();
  });

  it('disables the button without a resolvable artist (the notes must name one)', () => {
    renderReady(null);

    expect(generateButton()).toBeDisabled();
  });

  it('shows a pending label while the lookup runs', () => {
    mockLookup({ isFetching: true });
    renderReady();

    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
  });

  it('writes the generated paragraphs into the field, blank-line separated', async () => {
    const user = userEvent.setup();
    mockLookup({
      refetch: vi.fn().mockResolvedValue({
        data: { notes: ['First paragraph.', 'Second paragraph.'], sources: ['https://x'] },
      }),
    });
    renderReady();

    await user.click(generateButton());

    expect(screen.getByLabelText('Release Notes')).toHaveValue(
      'First paragraph.\n\nSecond paragraph.'
    );
  });

  it('reports the first source on success', async () => {
    const user = userEvent.setup();
    mockLookup({
      refetch: vi.fn().mockResolvedValue({
        data: { notes: ['Paragraph.'], sources: ['https://example.com/review'] },
      }),
    });
    renderReady();

    await user.click(generateButton());

    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com/review')
    );
  });

  it('informs the admin when nothing could be generated', async () => {
    const user = userEvent.setup();
    mockLookup({ refetch: vi.fn().mockResolvedValue({ data: null }) });
    renderReady();

    await user.click(generateButton());

    expect(toast.info).toHaveBeenCalledWith('No release notes could be generated');
    expect(screen.getByLabelText('Release Notes')).toHaveValue('');
  });

  it('surfaces a lookup error without touching the field', async () => {
    const user = userEvent.setup();
    mockLookup({
      refetch: vi.fn().mockResolvedValue({ error: new Error('nope'), data: undefined }),
    });
    const setValueRef = renderReady();
    act(() => {
      setValueRef.current?.('notes', 'Existing note.');
    });

    await user.click(generateButton());

    expect(toast.error).toHaveBeenCalledWith('Release notes generation failed');
    expect(screen.getByLabelText('Release Notes')).toHaveValue('Existing note.');
  });

  it('surfaces a thrown lookup failure', async () => {
    const user = userEvent.setup();
    mockLookup({ refetch: vi.fn().mockRejectedValue(new Error('boom')) });
    renderReady();

    await user.click(generateButton());

    expect(toast.error).toHaveBeenCalledWith('Release notes generation failed');
  });

  it('passes the release context to the lookup hook', () => {
    renderReady();

    expect(useReleaseNotesLookupQuery).toHaveBeenLastCalledWith('Broken Bone Ballads', 'Ceschi', {
      releasedOn: '2015-03-03',
      catalogNumber: 'FF4-042',
      formats: ['VINYL_12_INCH'],
    });
  });
});
