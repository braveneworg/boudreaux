import CheckboxField from './checkbox-field';
import ComboboxField from './combobox-field';
import CountryField from './country-field';
import StateField from './state-field';
import TextField from './text-field';

import * as Fields from './index';

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

  it('should export StateField', () => {
    expect(Fields.StateField).toBeDefined();
    expect(Fields.StateField).toBe(StateField);
  });

  it('should export CountryField', () => {
    expect(Fields.CountryField).toBeDefined();
    expect(Fields.CountryField).toBe(CountryField);
  });

  it('should only export 5 fields', () => {
    const exportedKeys = Object.keys(Fields);
    expect(exportedKeys).toHaveLength(5);
  });

  it('should export all expected fields', () => {
    const exportedKeys = Object.keys(Fields);
    expect(exportedKeys).toContain('TextField');
    expect(exportedKeys).toContain('CheckboxField');
    expect(exportedKeys).toContain('ComboboxField');
    expect(exportedKeys).toContain('StateField');
    expect(exportedKeys).toContain('CountryField');
  });
});
