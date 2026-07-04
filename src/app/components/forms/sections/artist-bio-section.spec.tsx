/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import { ArtistBioSection } from './artist-bio-section';

import type { Control } from 'react-hook-form';

// Stub heavy child components — this spec exercises layout structure only.
vi.mock('@/app/components/forms/artist-bio-generation-section', () => ({
  ArtistBioGenerationSection: () => <div data-testid="bio-gen-stub" />,
}));

vi.mock('@/app/components/forms/bio-media-palettes', () => ({
  BioMediaPalettes: ({ artistId }: { artistId: string }) => (
    <div data-testid={`bio-media-palettes-${artistId}`} />
  ),
}));

// next/dynamic resolves this lazily; mock the underlying module so the
// dynamic wrapper gets the stub regardless of pool.
vi.mock('@/app/components/ui/rich-text-editor', () => ({
  RichTextEditor: () => <div data-testid="rich-text-editor-stub" />,
}));

// FormLabel/FormControl call useFormField() which requires a live FormProvider
// context. Stub all shadcn form primitives so BioEditorField renders in tests
// without a real react-hook-form provider in scope.
vi.mock('@/app/components/ui/form', () => ({
  FormField: ({
    render: renderFn,
  }: {
    render: (props: { field: { value: string; onChange: () => void } }) => React.ReactElement;
  }) => renderFn({ field: { value: '', onChange: () => {} } }),
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  FormControl: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormMessage: () => null,
}));

const editModeProps = {
  control: {} as Control<ArtistFormData>,
  isEditMode: true,
  artistId: 'artist-1',
  bioEditorImages: [],
  onBioGenerated: vi.fn(),
};

describe('ArtistBioSection', () => {
  it('lays palettes in a sticky right rail on xl', () => {
    render(<ArtistBioSection {...editModeProps} />);
    const rail = screen.getByTestId('bio-media-rail');
    expect(rail.className).toContain('xl:sticky');
    expect(rail.className).toContain('xl:order-2');
    const editors = screen.getByTestId('bio-editors-column');
    expect(editors.className).toContain('xl:order-1');
  });

  it('renders the palette rail before the editors column in DOM order', () => {
    render(<ArtistBioSection {...editModeProps} />);
    const rail = screen.getByTestId('bio-media-rail');
    const editors = screen.getByTestId('bio-editors-column');
    // Node.DOCUMENT_POSITION_FOLLOWING (4) — editors comes after rail.
    const FOLLOWING = 4;
    expect(rail.compareDocumentPosition(editors) & FOLLOWING).toBeTruthy();
  });

  it('omits the palette rail in create mode', () => {
    render(<ArtistBioSection {...editModeProps} isEditMode={false} artistId={null} />);

    expect(screen.queryByTestId('bio-media-rail')).not.toBeInTheDocument();
  });

  it('always renders the editors column', () => {
    render(<ArtistBioSection {...editModeProps} isEditMode={false} artistId={null} />);

    expect(screen.getByTestId('bio-editors-column')).toBeInTheDocument();
  });
});
