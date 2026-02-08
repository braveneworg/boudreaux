import {
  sanitizeHtml,
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
  sanitizeUrl,
  sanitizeUsername,
  normalizeWhitespace,
  sanitizeTextField,
  sanitizeFilePath,
} from './sanitization';

describe('sanitization utilities', () => {
  describe('sanitizeHtml', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('returns empty string for null/undefined-like values', () => {
      expect(sanitizeHtml(null as unknown as string)).toBe('');
      expect(sanitizeHtml(undefined as unknown as string)).toBe('');
    });

    it('escapes ampersands', () => {
      expect(sanitizeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('escapes less than signs', () => {
      expect(sanitizeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
      );
    });

    it('escapes greater than signs', () => {
      expect(sanitizeHtml('100 > 50')).toBe('100 &gt; 50');
    });

    it('escapes double quotes', () => {
      expect(sanitizeHtml('He said "hello"')).toBe('He said &quot;hello&quot;');
    });

    it('escapes single quotes', () => {
      expect(sanitizeHtml("It's fine")).toBe('It&#x27;s fine');
    });

    it('escapes forward slashes', () => {
      expect(sanitizeHtml('path/to/file')).toBe('path&#x2F;to&#x2F;file');
    });

    it('handles multiple special characters', () => {
      expect(sanitizeHtml('<a href="test">Link</a>')).toBe(
        '&lt;a href=&quot;test&quot;&gt;Link&lt;&#x2F;a&gt;'
      );
    });
  });

  describe('sanitizeString', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeString('')).toBe('');
    });

    it('returns empty string for null/undefined-like values', () => {
      expect(sanitizeString(null as unknown as string)).toBe('');
    });

    it('removes null bytes', () => {
      expect(sanitizeString('hello\0world')).toBe('helloworld');
    });

    it('removes control characters', () => {
      expect(sanitizeString('hello\x00\x01\x02world')).toBe('helloworld');
    });

    it('trims whitespace', () => {
      expect(sanitizeString('  hello world  ')).toBe('hello world');
    });

    it('preserves normal characters', () => {
      expect(sanitizeString('Hello, World!')).toBe('Hello, World!');
    });

    it('preserves apostrophes and special punctuation', () => {
      expect(sanitizeString("John's café")).toBe("John's café");
    });
  });

  describe('sanitizeEmail', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeEmail('')).toBe('');
    });

    it('returns empty string for null/undefined-like values', () => {
      expect(sanitizeEmail(null as unknown as string)).toBe('');
    });

    it('converts to lowercase', () => {
      expect(sanitizeEmail('Test@Example.COM')).toBe('test@example.com');
    });

    it('trims whitespace', () => {
      expect(sanitizeEmail('  test@example.com  ')).toBe('test@example.com');
    });

    it('removes non-email characters', () => {
      expect(sanitizeEmail('test<script>@example.com')).toBe('testscript@example.com');
    });

    it('preserves plus signs', () => {
      expect(sanitizeEmail('test+filter@example.com')).toBe('test+filter@example.com');
    });

    it('preserves dots and hyphens', () => {
      expect(sanitizeEmail('first.last-name@example.com')).toBe('first.last-name@example.com');
    });
  });

  describe('sanitizePhone', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizePhone('')).toBe('');
    });

    it('returns empty string for null/undefined-like values', () => {
      expect(sanitizePhone(null as unknown as string)).toBe('');
    });

    it('preserves numbers', () => {
      expect(sanitizePhone('1234567890')).toBe('1234567890');
    });

    it('preserves plus sign', () => {
      expect(sanitizePhone('+1234567890')).toBe('+1234567890');
    });

    it('preserves parentheses, dashes, and spaces', () => {
      expect(sanitizePhone('(123) 456-7890')).toBe('(123) 456-7890');
    });

    it('removes letters and special characters', () => {
      expect(sanitizePhone('123-abc-4567!')).toBe('123--4567');
    });
  });

  describe('sanitizeUrl', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeUrl('')).toBe('');
    });

    it('returns empty string for null/undefined-like values', () => {
      expect(sanitizeUrl(null as unknown as string)).toBe('');
    });

    it('returns valid http URL', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
    });

    it('returns valid https URL', () => {
      expect(sanitizeUrl('https://example.com/path?query=1')).toBe(
        'https://example.com/path?query=1'
      );
    });

    it('returns empty string for javascript protocol', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    });

    it('returns empty string for data protocol', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('returns empty string for invalid URLs', () => {
      expect(sanitizeUrl('not a url')).toBe('');
    });

    it('returns empty string for ftp protocol', () => {
      expect(sanitizeUrl('ftp://example.com')).toBe('');
    });
  });

  describe('sanitizeUsername', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeUsername('')).toBe('');
    });

    it('returns empty string for null/undefined-like values', () => {
      expect(sanitizeUsername(null as unknown as string)).toBe('');
    });

    it('converts to lowercase', () => {
      expect(sanitizeUsername('UserName')).toBe('username');
    });

    it('trims whitespace', () => {
      expect(sanitizeUsername('  username  ')).toBe('username');
    });

    it('preserves dots, dashes, and underscores', () => {
      expect(sanitizeUsername('user.name-test_123')).toBe('user.name-test_123');
    });

    it('removes special characters', () => {
      expect(sanitizeUsername('user@name!')).toBe('username');
    });

    it('removes spaces', () => {
      expect(sanitizeUsername('user name')).toBe('username');
    });
  });

  describe('normalizeWhitespace', () => {
    it('returns empty string for empty input', () => {
      expect(normalizeWhitespace('')).toBe('');
    });

    it('returns empty string for null/undefined-like values', () => {
      expect(normalizeWhitespace(null as unknown as string)).toBe('');
    });

    it('replaces multiple spaces with single space', () => {
      expect(normalizeWhitespace('hello    world')).toBe('hello world');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normalizeWhitespace('  hello world  ')).toBe('hello world');
    });

    it('handles tabs and newlines', () => {
      expect(normalizeWhitespace('hello\t\nworld')).toBe('hello world');
    });

    it('preserves single spaces', () => {
      expect(normalizeWhitespace('hello world')).toBe('hello world');
    });
  });

  describe('sanitizeTextField', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeTextField('')).toBe('');
    });

    it('returns empty string for null/undefined-like values', () => {
      expect(sanitizeTextField(null as unknown as string)).toBe('');
    });

    it('removes control characters and normalizes whitespace', () => {
      expect(sanitizeTextField('hello\x00  world')).toBe('hello world');
    });

    it('trims and normalizes spaces', () => {
      expect(sanitizeTextField('  hello    world  ')).toBe('hello world');
    });

    it('preserves special characters in names', () => {
      expect(sanitizeTextField("  John O'Brien  ")).toBe("John O'Brien");
    });
  });

  describe('sanitizeFilePath', () => {
    const baseDir = '/tmp/backup';

    describe('valid paths', () => {
      it('allows simple relative paths', () => {
        expect(sanitizeFilePath('file.txt', baseDir)).toBe('file.txt');
      });

      it('allows nested directory paths', () => {
        expect(sanitizeFilePath('dir/subdir/file.txt', baseDir)).toBe('dir/subdir/file.txt');
      });

      it('normalizes redundant slashes', () => {
        expect(sanitizeFilePath('dir//file.txt', baseDir)).toBe('dir/file.txt');
      });

      it('normalizes current directory references', () => {
        expect(sanitizeFilePath('./dir/file.txt', baseDir)).toBe('dir/file.txt');
        expect(sanitizeFilePath('dir/./file.txt', baseDir)).toBe('dir/file.txt');
      });

      it('allows deeply nested paths', () => {
        expect(sanitizeFilePath('a/b/c/d/e/file.txt', baseDir)).toBe('a/b/c/d/e/file.txt');
      });
    });

    describe('path traversal prevention', () => {
      it('rejects absolute paths', () => {
        expect(() => sanitizeFilePath('/etc/passwd', baseDir)).toThrow(
          'Absolute paths are not allowed'
        );
      });

      it('rejects paths starting with ..', () => {
        expect(() => sanitizeFilePath('../etc/passwd', baseDir)).toThrow(
          'Path traversal attempt detected (..)'
        );
      });

      it('rejects paths with .. in the middle', () => {
        expect(() => sanitizeFilePath('dir/../../etc/passwd', baseDir)).toThrow(
          'Path traversal attempt detected (..)'
        );
      });

      it('rejects just .. path', () => {
        expect(() => sanitizeFilePath('..', baseDir)).toThrow(
          'Path traversal attempt detected (..)'
        );
      });

      it('rejects multiple .. segments', () => {
        expect(() => sanitizeFilePath('../../file.txt', baseDir)).toThrow(
          'Path traversal attempt detected (..)'
        );
      });

      it('handles Windows-style paths on POSIX systems', () => {
        // On POSIX systems, backslashes are treated as regular filename characters
        // This is acceptable since S3 uses forward slashes (POSIX-style paths)
        const result = sanitizeFilePath('C:\\Windows\\System32', baseDir);
        expect(result).toBe('C:\\Windows\\System32');
      });
    });

    describe('null byte and control character prevention', () => {
      it('rejects paths with null bytes', () => {
        expect(() => sanitizeFilePath('file\x00.txt', baseDir)).toThrow('Path contains null bytes');
      });

      it('rejects empty path', () => {
        expect(() => sanitizeFilePath('', baseDir)).toThrow('Path key cannot be empty');
      });
    });

    describe('verification against base directory', () => {
      it('verifies resolved path stays within base directory', () => {
        // This should work - stays within base
        expect(sanitizeFilePath('a/b/../c/file.txt', baseDir)).toBe('a/c/file.txt');
      });

      it('allows paths that resolve to base directory itself', () => {
        expect(sanitizeFilePath('a/../b/../c', baseDir)).toBe('c');
      });
    });

    describe('edge cases', () => {
      it('handles paths with spaces', () => {
        expect(sanitizeFilePath('my file.txt', baseDir)).toBe('my file.txt');
      });

      it('handles paths with special characters', () => {
        expect(sanitizeFilePath('file-name_2024.txt', baseDir)).toBe('file-name_2024.txt');
      });

      it('handles paths with dots in filenames', () => {
        expect(sanitizeFilePath('archive.tar.gz', baseDir)).toBe('archive.tar.gz');
      });
    });
  });
});
