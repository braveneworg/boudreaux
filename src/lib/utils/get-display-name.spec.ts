import { getDisplayName } from './get-display-name';

describe('getDisplayName', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('displayName priority', () => {
    it('should return displayName when available', () => {
      const item = { displayName: 'Display Name', title: 'Title', name: 'Name' };
      expect(getDisplayName(item)).toBe('Display Name');
    });

    it('should handle displayName with special characters', () => {
      const item = { displayName: "John's Display Name!" };
      expect(getDisplayName(item)).toBe("John's Display Name!");
    });
  });

  describe('title fallback', () => {
    it('should return title when displayName is not available', () => {
      const item = { title: 'Album Title', name: 'Name' };
      expect(getDisplayName(item)).toBe('Album Title');
    });

    it('should prefer displayName over title', () => {
      const item = { displayName: 'Display', title: 'Title' };
      expect(getDisplayName(item)).toBe('Display');
    });
  });

  describe('name fallback', () => {
    it('should return name when displayName and title are not available', () => {
      const item = { name: 'Group Name' };
      expect(getDisplayName(item)).toBe('Group Name');
    });

    it('should prefer title over name', () => {
      const item = { title: 'Title', name: 'Name' };
      expect(getDisplayName(item)).toBe('Title');
    });
  });

  describe('firstName/surname fallback', () => {
    it('should return formatted name when firstName and surname are available', () => {
      const item = { firstName: 'John', surname: 'Doe' };
      expect(getDisplayName(item)).toBe('John Doe');
    });

    it('should prefer displayName over firstName/surname', () => {
      const item = { displayName: 'JD', firstName: 'John', surname: 'Doe' };
      expect(getDisplayName(item)).toBe('JD');
    });

    it('should prefer title over firstName/surname', () => {
      const item = { title: 'Title', firstName: 'John', surname: 'Doe' };
      expect(getDisplayName(item)).toBe('Title');
    });

    it('should prefer name over firstName/surname', () => {
      const item = { name: 'Name', firstName: 'John', surname: 'Doe' };
      expect(getDisplayName(item)).toBe('Name');
    });
  });

  describe('error handling', () => {
    it('should return error message when no valid fields are available', () => {
      const item = {};
      expect(getDisplayName(item)).toBe(' - Error: Unknown entity name');
      expect(console.error).toHaveBeenCalled();
    });

    it('should return error when displayName is not a string', () => {
      const item = { displayName: 123 };
      expect(getDisplayName(item)).toBe(' - Error: Unknown entity name');
    });

    it('should return error when title is not a string', () => {
      const item = { title: 456 };
      expect(getDisplayName(item)).toBe(' - Error: Unknown entity name');
    });

    it('should return error when name is not a string', () => {
      const item = { name: true };
      expect(getDisplayName(item)).toBe(' - Error: Unknown entity name');
    });

    it('should return error when firstName is available but surname is not', () => {
      const item = { firstName: 'John' };
      expect(getDisplayName(item)).toBe(' - Error: Unknown entity name');
    });

    it('should return error when surname is available but firstName is not', () => {
      const item = { surname: 'Doe' };
      expect(getDisplayName(item)).toBe(' - Error: Unknown entity name');
    });

    it('should return error when firstName is not a string', () => {
      const item = { firstName: 123, surname: 'Doe' };
      expect(getDisplayName(item)).toBe(' - Error: Unknown entity name');
    });

    it('should return error when surname is not a string', () => {
      const item = { firstName: 'John', surname: 456 };
      expect(getDisplayName(item)).toBe(' - Error: Unknown entity name');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string displayName', () => {
      const item = { displayName: '', title: 'Title' };
      expect(getDisplayName(item)).toBe('Title');
    });

    it('should handle whitespace-only displayName', () => {
      // Whitespace is still a truthy string, so it will be returned
      const item = { displayName: '   ', title: 'Title' };
      expect(getDisplayName(item)).toBe('   ');
    });

    it('should handle null values', () => {
      const item = { displayName: null, title: null, name: null };
      expect(getDisplayName(item as unknown as Record<string, unknown>)).toBe(
        ' - Error: Unknown entity name'
      );
    });

    it('should handle undefined values', () => {
      const item = { displayName: undefined, title: undefined };
      expect(getDisplayName(item)).toBe(' - Error: Unknown entity name');
    });
  });
});
