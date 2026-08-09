/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Form } from '@/app/components/ui/form';
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';

import { ReleaseDescriptionField } from './release-description-field';
import { useReleaseDescriptionLookupQuery } from '../_hooks/use-release-description-lookup-query';

import type { UseFormSetValue } from 'react-hook-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../_hooks/use-release-description-lookup-query', () => ({
  useReleaseDescriptionLookupQuery: vi.fn(),
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
      description: '',
      notes: '',
      releasedOn: '',
      catalogNumber: '',
      formats: [],
    },
  });

  setValueRef.current = form.setValue;

  return (
    <Form {...form}>
      <ReleaseDescriptionField
        control={form.control}
        setValue={form.setValue}
        artistName={artistName}
      />
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
    setValueRef.current?.('notes', 'Cut live to tape.\nSleeve screened by hand.');
  });
  return setValueRef;
};

const mockLookup = (overrides: Record<string, unknown> = {}): void => {
  vi.mocked(useReleaseDescriptionLookupQuery).mockReturnValue({
    isFetching: false,
    error: undefined,
    data: undefined,
    refetch: vi.fn().mockResolvedValue({ data: undefined }),
    ...overrides,
  } as unknown as ReturnType<typeof useReleaseDescriptionLookupQuery>);
};

const generateButton = () => screen.getByRole('button', { name: 'Generate blurb' });

describe('ReleaseDescriptionField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookup();
  });

  it('renders the description textarea with a generate button', () => {
    renderReady();

    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(generateButton()).toBeEnabled();
  });

  it('disables the button without a title', () => {
    render(<Wrapper setValueRef={makeSetValueRef()} />);

    expect(generateButton()).toBeDisabled();
  });

  it('disables the button without a resolvable artist (the blurb must name one)', () => {
    renderReady(null);

    expect(generateButton()).toBeDisabled();
  });

  it('shows a pending label while the lookup runs', () => {
    mockLookup({ isFetching: true });
    renderReady();

    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
  });

  it('writes the generated blurb into the description field', async () => {
    const user = userEvent.setup();
    mockLookup({
      refetch: vi.fn().mockResolvedValue({
        data: { description: 'A short blurb.', sources: ['https://x'] },
      }),
    });
    renderReady();

    await user.click(generateButton());

    expect(screen.getByLabelText('Description')).toHaveValue('A short blurb.');
  });

  it('leaves the label notes untouched when generating', async () => {
    const user = userEvent.setup();
    mockLookup({
      refetch: vi.fn().mockResolvedValue({
        data: { description: 'A short blurb.', sources: ['https://x'] },
      }),
    });
    const setValueRef = renderReady();

    await user.click(generateButton());

    expect(setValueRef.current).not.toBeNull();
    expect(screen.getByLabelText('Description')).toHaveValue('A short blurb.');
  });

  it('reports the first source on success', async () => {
    const user = userEvent.setup();
    mockLookup({
      refetch: vi.fn().mockResolvedValue({
        data: { description: 'A blurb.', sources: ['https://example.com/review'] },
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

    expect(toast.info).toHaveBeenCalledWith('No blurb could be generated');
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  it('surfaces a lookup error without touching the field', async () => {
    const user = userEvent.setup();
    mockLookup({
      refetch: vi.fn().mockResolvedValue({ error: new Error('nope'), data: undefined }),
    });
    const setValueRef = renderReady();
    act(() => {
      setValueRef.current?.('description', 'Existing blurb.');
    });

    await user.click(generateButton());

    expect(toast.error).toHaveBeenCalledWith('Blurb generation failed');
    expect(screen.getByLabelText('Description')).toHaveValue('Existing blurb.');
  });

  it('surfaces a thrown lookup failure', async () => {
    const user = userEvent.setup();
    mockLookup({ refetch: vi.fn().mockRejectedValue(new Error('boom')) });
    renderReady();

    await user.click(generateButton());

    expect(toast.error).toHaveBeenCalledWith('Blurb generation failed');
  });

  it('passes the release context AND the label notes to the lookup hook', () => {
    renderReady();

    expect(useReleaseDescriptionLookupQuery).toHaveBeenLastCalledWith(
      'Broken Bone Ballads',
      'Ceschi',
      {
        releasedOn: '2015-03-03',
        catalogNumber: 'FF4-042',
        formats: ['VINYL_12_INCH'],
        labelNotes: 'Cut live to tape.\nSleeve screened by hand.',
      }
    );
  });

  it('tells the admin the blurb builds on the notes below', () => {
    renderReady();

    expect(screen.getByText(/builds on the Release Notes below/i)).toBeInTheDocument();
  });
});
