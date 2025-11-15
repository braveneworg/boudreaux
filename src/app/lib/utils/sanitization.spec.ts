import {
  normalizeWhitespace,
  sanitizeEmail,
  sanitizeHtml,
  sanitizePhone,
  sanitizeString,
  sanitizeTextField,
  sanitizeUrl,
  sanitizeUsername,
} from './sanitization';

describe('sanitizeHtml', () => {
  it('should escape HTML special characters', () => {
    const input = '<script>alert("XSS")</script>';
    const expected = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;';
    expect(sanitizeHtml(input)).toBe(expected);
  });

  it('should escape ampersands', () => {
    expect(sanitizeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('should escape quotes', () => {
    expect(sanitizeHtml('Say "hello"')).toBe('Say &quot;hello&quot;');
    expect(sanitizeHtml("It's nice")).toBe('It&#x27;s nice');
  });

  it('should escape forward slashes', () => {
    expect(sanitizeHtml('a/b/c')).toBe('a&#x2F;b&#x2F;c');
  });

  it('should return empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('should return empty string for null/undefined input', () => {
    expect(sanitizeHtml(null as unknown as string)).toBe('');
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeString', () => {
  it('should remove null bytes', () => {
    const input = 'Hello\0World';
    expect(sanitizeString(input)).toBe('HelloWorld');
  });

  it('should remove control characters', () => {
    const input = 'Hello\x00\x08\x0B\x0C\x0E\x1F\x7FWorld';
    expect(sanitizeString(input)).toBe('HelloWorld');
  });

  it('should trim whitespace', () => {
    expect(sanitizeString('  Hello World  ')).toBe('Hello World');
  });

  it('should preserve legitimate special characters', () => {
    expect(sanitizeString("O'Brien")).toBe("O'Brien");
    expect(sanitizeString('José García')).toBe('José García');
    expect(sanitizeString('123 Main St.')).toBe('123 Main St.');
  });

  it('should return empty string for empty input', () => {
    expect(sanitizeString('')).toBe('');
  });

  it('should return empty string for null/undefined input', () => {
    expect(sanitizeString(null as unknown as string)).toBe('');
    expect(sanitizeString(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeEmail', () => {
  it('should convert to lowercase', () => {
    expect(sanitizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('should trim whitespace', () => {
    expect(sanitizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('should allow valid email characters', () => {
    expect(sanitizeEmail('user+tag@example.com')).toBe('user+tag@example.com');
    expect(sanitizeEmail('user.name@example.com')).toBe('user.name@example.com');
    expect(sanitizeEmail('user-name@example.com')).toBe('user-name@example.com');
  });

  it('should remove invalid characters', () => {
    expect(sanitizeEmail('user<script>@example.com')).toBe('userscript@example.com');
    expect(sanitizeEmail('user"name"@example.com')).toBe('username@example.com');
  });

  it('should return empty string for empty input', () => {
    expect(sanitizeEmail('')).toBe('');
  });

  it('should return empty string for null/undefined input', () => {
    expect(sanitizeEmail(null as unknown as string)).toBe('');
    expect(sanitizeEmail(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizePhone', () => {
  it('should preserve digits', () => {
    expect(sanitizePhone('1234567890')).toBe('1234567890');
  });

  it('should preserve phone formatting characters', () => {
    expect(sanitizePhone('+1 (555) 123-4567')).toBe('+1 (555) 123-4567');
  });

  it('should remove letters and special characters', () => {
    expect(sanitizePhone('555-CALL-NOW')).toBe('555--');
  });

  it('should remove invalid special characters', () => {
    expect(sanitizePhone('555<script>1234')).toBe('5551234');
  });

  it('should return empty string for empty input', () => {
    expect(sanitizePhone('')).toBe('');
  });

  it('should return empty string for null/undefined input', () => {
    expect(sanitizePhone(null as unknown as string)).toBe('');
    expect(sanitizePhone(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeUrl', () => {
  it('should allow valid http URLs', () => {
    const url = 'http://example.com/path';
    expect(sanitizeUrl(url)).toBe(url);
  });

  it('should allow valid https URLs', () => {
    const url = 'https://example.com/path';
    expect(sanitizeUrl(url)).toBe(url);
  });

  it('should reject javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert("XSS")')).toBe('');
  });

  it('should reject data: protocol', () => {
    expect(sanitizeUrl('data:text/html,<script>alert("XSS")</script>')).toBe('');
  });

  it('should reject file: protocol', () => {
    expect(sanitizeUrl('file:///etc/passwd')).toBe('');
  });

  it('should return empty string for invalid URLs', () => {
    expect(sanitizeUrl('not a url')).toBe('');
    expect(sanitizeUrl('://')).toBe('');
  });

  it('should return empty string for empty input', () => {
    expect(sanitizeUrl('')).toBe('');
  });

  it('should return empty string for null/undefined input', () => {
    expect(sanitizeUrl(null as unknown as string)).toBe('');
    expect(sanitizeUrl(undefined as unknown as string)).toBe('');
  });

  it('should normalize URL format', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
    expect(sanitizeUrl('https://example.com/path?query=1')).toBe(
      'https://example.com/path?query=1'
    );
  });
});

describe('sanitizeUsername', () => {
  it('should convert to lowercase', () => {
    expect(sanitizeUsername('JohnDoe')).toBe('johndoe');
  });

  it('should trim whitespace', () => {
    expect(sanitizeUsername('  johndoe  ')).toBe('johndoe');
  });

  it('should allow valid username characters', () => {
    expect(sanitizeUsername('john.doe')).toBe('john.doe');
    expect(sanitizeUsername('john-doe')).toBe('john-doe');
    expect(sanitizeUsername('john_doe')).toBe('john_doe');
    expect(sanitizeUsername('john123')).toBe('john123');
  });

  it('should remove invalid characters', () => {
    expect(sanitizeUsername('john@doe')).toBe('johndoe');
    expect(sanitizeUsername('john doe')).toBe('johndoe');
    expect(sanitizeUsername('john<script>')).toBe('johnscript');
  });

  it('should return empty string for empty input', () => {
    expect(sanitizeUsername('')).toBe('');
  });

  it('should return empty string for null/undefined input', () => {
    expect(sanitizeUsername(null as unknown as string)).toBe('');
    expect(sanitizeUsername(undefined as unknown as string)).toBe('');
  });
});

describe('normalizeWhitespace', () => {
  it('should replace multiple spaces with single space', () => {
    expect(normalizeWhitespace('Hello    World')).toBe('Hello World');
  });

  it('should replace tabs with single space', () => {
    expect(normalizeWhitespace('Hello\t\tWorld')).toBe('Hello World');
  });

  it('should replace newlines with single space', () => {
    expect(normalizeWhitespace('Hello\n\nWorld')).toBe('Hello World');
  });

  it('should trim whitespace', () => {
    expect(normalizeWhitespace('  Hello World  ')).toBe('Hello World');
  });

  it('should handle mixed whitespace', () => {
    expect(normalizeWhitespace('  Hello \t\n  World  ')).toBe('Hello World');
  });

  it('should return empty string for empty input', () => {
    expect(normalizeWhitespace('')).toBe('');
  });

  it('should return empty string for null/undefined input', () => {
    expect(normalizeWhitespace(null as unknown as string)).toBe('');
    expect(normalizeWhitespace(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeTextField', () => {
  it('should combine string sanitization and whitespace normalization', () => {
    const input = '  Hello\x00  \t  World\x08  ';
    expect(sanitizeTextField(input)).toBe('Hello World');
  });

  it('should remove control characters and normalize whitespace', () => {
    expect(sanitizeTextField('Hello\x00\x08   World')).toBe('Hello World');
  });

  it('should preserve legitimate characters', () => {
    expect(sanitizeTextField("  O'Brien   García  ")).toBe("O'Brien García");
  });

  it('should return empty string for empty input', () => {
    expect(sanitizeTextField('')).toBe('');
  });

  it('should return empty string for null/undefined input', () => {
    expect(sanitizeTextField(null as unknown as string)).toBe('');
    expect(sanitizeTextField(undefined as unknown as string)).toBe('');
  });
});
