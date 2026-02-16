/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import CheckboxField from './checkbox-field';
import ComboboxField from './combobox-field';
import CountryField from './country-field';
import CoverArtField from './cover-art-field';
import StateField from './state-field';
import TextField from './text-field';

import * as Fields from './index';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction: vi.fn(),
}));
vi.mock('@/lib/actions/artist-image-actions', () => ({
  getArtistImagesAction: vi.fn(),
}));
vi.mock('@/lib/utils/direct-upload', () => ({
  uploadFileToS3: vi.fn(),
}));

describe('Form Fields Index', () => {
  it('should export TextField', () => {
    expect(Fields.TextField).toBeDefined();
    expect(Fields.TextField).toBe(TextField);
  });

  it('should export CheckboxField', () => {
    expect(Fields.CheckboxField).toBeDefined();
    expect(Fields.CheckboxField).toBe(CheckboxField);
  });

  it('should export ComboboxField', () => {
    expect(Fields.ComboboxField).toBeDefined();
    expect(Fields.ComboboxField).toBe(ComboboxField);
  });

  it('should export CoverArtField', () => {
    expect(Fields.CoverArtField).toBeDefined();
    expect(Fields.CoverArtField).toBe(CoverArtField);
  });

  it('should export StateField', () => {
    expect(Fields.StateField).toBeDefined();
    expect(Fields.StateField).toBe(StateField);
  });

  it('should export CountryField', () => {
    expect(Fields.CountryField).toBeDefined();
    expect(Fields.CountryField).toBe(CountryField);
  });

  it('should only export 6 fields', () => {
    const exportedKeys = Object.keys(Fields);
    expect(exportedKeys).toHaveLength(6);
  });

  it('should export all expected fields', () => {
    const exportedKeys = Object.keys(Fields);
    expect(exportedKeys).toContain('TextField');
    expect(exportedKeys).toContain('CheckboxField');
    expect(exportedKeys).toContain('ComboboxField');
    expect(exportedKeys).toContain('CoverArtField');
    expect(exportedKeys).toContain('StateField');
    expect(exportedKeys).toContain('CountryField');
  });
});
