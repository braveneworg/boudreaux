/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ImageUploadActionResult } from '@/lib/actions/artist-image-actions';
import { artistDetailSchema } from '@/lib/validation/media/artist-schema';

import { CoverArtImageCombobox } from './cover-art-image-combobox';

import type { ArtistDetail } from '../_hooks/use-artist-query';

const useArtistsQuery = vi.hoisted(() => vi.fn());
vi.mock('../_hooks/use-artists-query', () => ({ useArtistsQuery }));

const getArtistImagesAction = vi.hoisted(() => vi.fn());
vi.mock('@/lib/actions/artist-image-actions', () => ({ getArtistImagesAction }));

// Render next/image as a plain <img> via createElement (not JSX) so findByAltText
// works while sidestepping the @next/next/no-img-element lint rule.
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => createElement('img', { alt, src }),
}));

// Radix Command (cmdk) scrolls the active item into view on open; jsdom lacks it.
Element.prototype.scrollIntoView = vi.fn();

/** Type of a single artist image returned by `getArtistImagesAction`. */
type ActionImage = NonNullable<ImageUploadActionResult['data']>[number];

/**
 * Builds a fully-typed {@link ArtistDetail} by parsing a minimal raw object
 * through the real schema, so fixtures stay precise without hand-listing every
 * scalar field. Only the name-related fields the component reads are varied.
 */
const buildArtist = (overrides: {
  id: string;
  firstName?: string;
  surname?: string;
  displayName?: string | null;
}): ArtistDetail =>
  artistDetailSchema.parse({
    id: overrides.id,
    firstName: overrides.firstName ?? '',
    middleName: null,
    surname: overrides.surname ?? '',
    akaNames: null,
    displayName: overrides.displayName ?? null,
    title: null,
    suffix: null,
    phone: null,
    email: null,
    address1: null,
    address2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    bio: null,
    shortBio: null,
    altBio: null,
    bioGeneratedAt: null,
    bioModel: null,
    bioStatus: null,
    bioError: null,
    bioStartedAt: null,
    bioJobToken: null,
    bioProgress: null,
    slug: `slug-${overrides.id}`,
    genres: null,
    bornOn: null,
    diedOn: null,
    formedOn: null,
    publishedOn: null,
    publishedBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: null,
    updatedAt: null,
    updatedBy: null,
    deletedOn: null,
    deletedBy: null,
    deactivatedAt: null,
    deactivatedBy: null,
    reactivatedAt: null,
    reactivatedBy: null,
    notes: [],
    tags: null,
    isPseudonymous: false,
    isActive: true,
    instruments: null,
    featuredArtistId: null,
    images: [],
  });

/** Builds a single artist-image fixture as returned by the server action. */
const buildImage = (overrides: Partial<ActionImage> & { id: string }): ActionImage => ({
  src: `https://cdn.test/${overrides.id}.jpg`,
  caption: undefined,
  altText: undefined,
  sortOrder: 0,
  ...overrides,
});

const successResult = (images: ActionImage[]): ImageUploadActionResult => ({
  success: true,
  data: images,
});

const baseProps = {
  artistIds: ['artist-1'],
  currentValue: '',
  disabled: false,
  isUploading: false,
  onSelect: vi.fn(),
};

const setArtistsById = (artistsById: Record<string, ArtistDetail | null | undefined>): void => {
  useArtistsQuery.mockReturnValue({ artistsById, isPending: false });
};

// On mount the component fetches artist images, disabling the trigger while the
// request is in flight. Wait for it to settle (re-enable) before clicking, so
// the open click isn't dropped by the momentarily-disabled button. Returns the
// trigger button captured before opening — once open, cmdk's CommandInput also
// exposes `role="combobox"`, so a fresh `getByRole('combobox')` is ambiguous.
const openPopover = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
  const trigger = screen.getByRole('combobox');
  await waitFor(() => expect(trigger).toBeEnabled());
  await user.click(trigger);
  return trigger;
};

describe('CoverArtImageCombobox', () => {
  beforeEach(() => {
    setArtistsById({ 'artist-1': buildArtist({ id: 'artist-1', displayName: 'The Band' }) });
    getArtistImagesAction.mockResolvedValue(successResult([]));
  });

  it('renders nothing when no artist ids are provided', () => {
    const { container } = render(<CoverArtImageCombobox {...baseProps} artistIds={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the helper label when artist ids are provided', () => {
    render(<CoverArtImageCombobox {...baseProps} />);

    expect(screen.getByText('Or select from artist images:')).toBeInTheDocument();
  });

  it('shows the default trigger label when nothing is selected', async () => {
    render(<CoverArtImageCombobox {...baseProps} />);

    // Wait for the on-mount image fetch to settle so the transient
    // "Loading artist images..." label has cleared.
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose from artist images...');
  });

  it('opens the popover on click', async () => {
    const user = userEvent.setup({ delay: null });
    render(<CoverArtImageCombobox {...baseProps} />);

    const trigger = await openPopover(user);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the search input placeholder when open', async () => {
    const user = userEvent.setup({ delay: null });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(screen.getByPlaceholderText('Search artist images...')).toBeInTheDocument();
  });

  it('shows the empty state when the artist has no images', async () => {
    const user = userEvent.setup({ delay: null });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('No artist images found.')).toBeInTheDocument();
  });

  it('disables the trigger while a fetch is in flight (loading label)', async () => {
    let resolveAction: (value: ImageUploadActionResult) => void = () => {};
    getArtistImagesAction.mockReturnValue(
      new Promise<ImageUploadActionResult>((resolve) => {
        resolveAction = resolve;
      })
    );
    render(<CoverArtImageCombobox {...baseProps} />);

    expect(await screen.findByText('Loading artist images...')).toBeInTheDocument();

    resolveAction(successResult([]));
  });

  it('disables the trigger via the disabled prop', () => {
    getArtistImagesAction.mockResolvedValue(successResult([]));
    render(<CoverArtImageCombobox {...baseProps} disabled />);

    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('disables the trigger via the isUploading prop', () => {
    getArtistImagesAction.mockResolvedValue(successResult([]));
    render(<CoverArtImageCombobox {...baseProps} isUploading />);

    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('fetches images for every provided artist id', async () => {
    getArtistImagesAction.mockResolvedValue(successResult([]));
    setArtistsById({
      'artist-1': buildArtist({ id: 'artist-1', displayName: 'One' }),
      'artist-2': buildArtist({ id: 'artist-2', displayName: 'Two' }),
    });
    render(<CoverArtImageCombobox {...baseProps} artistIds={['artist-2', 'artist-1']} />);

    await waitFor(() => expect(getArtistImagesAction).toHaveBeenCalledTimes(2));
  });

  it('renders an option for each returned image with its artist name', async () => {
    const user = userEvent.setup({ delay: null });
    getArtistImagesAction.mockResolvedValue(successResult([buildImage({ id: 'img-1' })]));
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('The Band')).toBeInTheDocument();
  });

  it('renders the image caption when present', async () => {
    const user = userEvent.setup({ delay: null });
    getArtistImagesAction.mockResolvedValue(
      successResult([buildImage({ id: 'img-1', caption: 'Live at the Apollo' })])
    );
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('Live at the Apollo')).toBeInTheDocument();
  });

  it('uses altText for the image alt when provided', async () => {
    const user = userEvent.setup({ delay: null });
    getArtistImagesAction.mockResolvedValue(
      successResult([buildImage({ id: 'img-1', altText: 'A cool photo', caption: 'cap' })])
    );
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByAltText('A cool photo')).toBeInTheDocument();
  });

  it('falls back to caption for the image alt when altText is absent', async () => {
    const user = userEvent.setup({ delay: null });
    getArtistImagesAction.mockResolvedValue(
      successResult([buildImage({ id: 'img-1', caption: 'Just a caption' })])
    );
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByAltText('Just a caption')).toBeInTheDocument();
  });

  it('falls back to a generic alt when neither altText nor caption is present', async () => {
    const user = userEvent.setup({ delay: null });
    getArtistImagesAction.mockResolvedValue(successResult([buildImage({ id: 'img-1' })]));
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByAltText('Artist image')).toBeInTheDocument();
  });

  it('calls onSelect with the image src when an option is chosen', async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = vi.fn();
    getArtistImagesAction.mockResolvedValue(
      successResult([buildImage({ id: 'img-1', src: 'https://cdn.test/chosen.jpg' })])
    );
    render(<CoverArtImageCombobox {...baseProps} onSelect={onSelect} />);

    await openPopover(user);
    await user.click(await screen.findByRole('option'));

    expect(onSelect).toHaveBeenCalledWith('https://cdn.test/chosen.jpg');
  });

  it('closes the popover after an option is chosen', async () => {
    const user = userEvent.setup({ delay: null });
    getArtistImagesAction.mockResolvedValue(successResult([buildImage({ id: 'img-1' })]));
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);
    await user.click(await screen.findByRole('option'));

    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
    );
  });

  it('shows the selected trigger label when currentValue matches an image', async () => {
    getArtistImagesAction.mockResolvedValue(
      successResult([buildImage({ id: 'img-1', src: 'https://cdn.test/sel.jpg' })])
    );
    render(<CoverArtImageCombobox {...baseProps} currentValue="https://cdn.test/sel.jpg" />);

    expect(await screen.findByText('The Band - image selected')).toBeInTheDocument();
  });

  it('marks the selected option with an opaque check indicator', async () => {
    const user = userEvent.setup({ delay: null });
    getArtistImagesAction.mockResolvedValue(
      successResult([buildImage({ id: 'img-1', src: 'https://cdn.test/sel.jpg' })])
    );
    render(<CoverArtImageCombobox {...baseProps} currentValue="https://cdn.test/sel.jpg" />);

    await openPopover(user);

    expect(await screen.findByRole('option')).toContainHTML('opacity-100');
  });

  it('does not mark an unselected option as checked', async () => {
    const user = userEvent.setup({ delay: null });
    getArtistImagesAction.mockResolvedValue(
      successResult([buildImage({ id: 'img-1', src: 'https://cdn.test/other.jpg' })])
    );
    render(<CoverArtImageCombobox {...baseProps} currentValue="https://cdn.test/sel.jpg" />);

    await openPopover(user);

    expect(await screen.findByRole('option')).toContainHTML('opacity-0');
  });

  it('falls back to first/last name when displayName is empty', async () => {
    const user = userEvent.setup({ delay: null });
    setArtistsById({
      'artist-1': buildArtist({ id: 'artist-1', firstName: 'Ada', surname: 'Lovelace' }),
    });
    getArtistImagesAction.mockResolvedValue(successResult([buildImage({ id: 'img-1' })]));
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('shows "(no name)" when an artist has no name parts', async () => {
    const user = userEvent.setup({ delay: null });
    setArtistsById({ 'artist-1': buildArtist({ id: 'artist-1' }) });
    getArtistImagesAction.mockResolvedValue(successResult([buildImage({ id: 'img-1' })]));
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('(no name)')).toBeInTheDocument();
  });

  it('shows "(no name)" when the queried artist entry is null', async () => {
    const user = userEvent.setup({ delay: null });
    setArtistsById({ 'artist-1': null });
    getArtistImagesAction.mockResolvedValue(successResult([buildImage({ id: 'img-1' })]));
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('(no name)')).toBeInTheDocument();
  });

  it('shows "(no name)" when the image artist id is absent from the name map', async () => {
    const user = userEvent.setup({ delay: null });
    setArtistsById({});
    getArtistImagesAction.mockResolvedValue(successResult([buildImage({ id: 'img-1' })]));
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('(no name)')).toBeInTheDocument();
  });

  it('skips images for an artist whose action reports failure', async () => {
    const user = userEvent.setup({ delay: null });
    getArtistImagesAction.mockResolvedValue({ success: false, error: 'boom' });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('No artist images found.')).toBeInTheDocument();
  });

  it('skips images for an artist whose action succeeds with no data', async () => {
    const user = userEvent.setup({ delay: null });
    getArtistImagesAction.mockResolvedValue({ success: true });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('No artist images found.')).toBeInTheDocument();
  });

  it('logs and recovers when the image fetch rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    getArtistImagesAction.mockRejectedValue(new Error('network down'));
    render(<CoverArtImageCombobox {...baseProps} />);

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith('Failed to fetch artist images:', expect.any(Error))
    );

    consoleError.mockRestore();
  });

  it('clears images and skips fetching when artist ids become empty after mount', async () => {
    getArtistImagesAction.mockResolvedValue(successResult([buildImage({ id: 'img-1' })]));
    const { rerender } = render(<CoverArtImageCombobox {...baseProps} />);

    await waitFor(() => expect(getArtistImagesAction).toHaveBeenCalledTimes(1));
    getArtistImagesAction.mockClear();

    rerender(<CoverArtImageCombobox {...baseProps} artistIds={[]} />);

    expect(getArtistImagesAction).not.toHaveBeenCalled();
  });
});
