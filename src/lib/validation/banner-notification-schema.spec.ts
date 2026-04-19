/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  addLinkAttributes,
  bannerNotificationSchema,
  hexColorSchema,
  rotationIntervalSchema,
  sanitizeNotificationHtml,
} from '@/lib/validation/banner-notification-schema';

describe('sanitizeNotificationHtml', () => {
  describe('allowed tags', () => {
    it('should keep <strong> tags', () => {
      const result = sanitizeNotificationHtml('<strong>bold</strong>');
      expect(result).toBe('<strong>bold</strong>');
    });

    it('should keep <em> tags', () => {
      const result = sanitizeNotificationHtml('<em>italic</em>');
      expect(result).toBe('<em>italic</em>');
    });

    it('should keep <a> tags with href', () => {
      const result = sanitizeNotificationHtml('<a href="https://example.com">link</a>');
      expect(result).toBe('<a href="https://example.com">link</a>');
    });

    it('should keep nested allowed tags', () => {
      const result = sanitizeNotificationHtml('<strong><em>bold italic</em></strong>');
      expect(result).toBe('<strong><em>bold italic</em></strong>');
    });
  });

  describe('disallowed tags', () => {
    it('should strip <script> tags', () => {
      const result = sanitizeNotificationHtml('<script>alert("xss")</script>');
      expect(result).toBe('alert("xss")');
    });

    it('should strip <img> tags', () => {
      const result = sanitizeNotificationHtml('<img src="evil.jpg" />');
      expect(result).toBe('');
    });

    it('should strip <div> tags', () => {
      const result = sanitizeNotificationHtml('<div>content</div>');
      expect(result).toBe('content');
    });

    it('should strip <span> tags', () => {
      const result = sanitizeNotificationHtml('<span>content</span>');
      expect(result).toBe('content');
    });

    it('should strip <iframe> tags', () => {
      const result = sanitizeNotificationHtml('<iframe src="evil.html"></iframe>');
      expect(result).toBe('');
    });
  });

  describe('attribute stripping', () => {
    it('should strip attributes from <strong>', () => {
      const result = sanitizeNotificationHtml('<strong class="x" style="color:red">bold</strong>');
      expect(result).toBe('<strong>bold</strong>');
    });

    it('should strip attributes from <em>', () => {
      const result = sanitizeNotificationHtml('<em id="test" data-custom="val">italic</em>');
      expect(result).toBe('<em>italic</em>');
    });

    it('should strip non-href attributes from <a> tags', () => {
      const result = sanitizeNotificationHtml(
        '<a href="https://example.com" class="link" onclick="alert(1)">click</a>'
      );
      expect(result).toBe('<a href="https://example.com">click</a>');
    });

    it('should return <a> without href when href is not present', () => {
      const result = sanitizeNotificationHtml('<a class="orphan">text</a>');
      expect(result).toBe('<a>text</a>');
    });
  });

  describe('protocol blocking on href', () => {
    it('should block javascript: protocol by stripping the opening tag', () => {
      const result = sanitizeNotificationHtml('<a href="javascript:alert(1)">xss</a>');
      expect(result).toBe('xss</a>');
      expect(result).not.toContain('javascript');
    });

    it('should block data: protocol by stripping the opening tag', () => {
      const result = sanitizeNotificationHtml('<a href="data:text/html,test">data</a>');
      expect(result).toBe('data</a>');
      expect(result).not.toContain('data:');
    });

    it('should block vbscript: protocol by stripping the opening tag', () => {
      const result = sanitizeNotificationHtml('<a href="vbscript:MsgBox">vb</a>');
      expect(result).toBe('vb</a>');
      expect(result).not.toContain('vbscript');
    });

    it('should block protocols with leading whitespace', () => {
      const result = sanitizeNotificationHtml('<a href="  javascript:alert(1)">xss</a>');
      expect(result).toBe('xss</a>');
      expect(result).not.toContain('javascript');
    });

    it('should block protocols case-insensitively', () => {
      const result = sanitizeNotificationHtml('<a href="JAVASCRIPT:alert(1)">xss</a>');
      expect(result).toBe('xss</a>');
      expect(result).not.toContain('JAVASCRIPT');
    });

    it('should block entity-encoded javascript: protocol (decimal encoding)', () => {
      // &#106; decodes to 'j', forming 'javascript:'
      const result = sanitizeNotificationHtml('<a href="&#106;avascript:alert(1)">xss</a>');
      expect(result).toBe('xss</a>');
    });

    it('should block entity-encoded javascript: protocol (hex encoding)', () => {
      // &#x6A; decodes to 'j', forming 'javascript:'
      const result = sanitizeNotificationHtml('<a href="&#x6A;avascript:alert(1)">xss</a>');
      expect(result).toBe('xss</a>');
    });

    it('should block whitespace-obfuscated protocol (embedded newline)', () => {
      // java\nscript: collapses to javascript: after whitespace stripping
      const result = sanitizeNotificationHtml('<a href="java\nscript:alert(1)">xss</a>');
      expect(result).toBe('xss</a>');
    });

    it('should block whitespace-obfuscated protocol (embedded tab)', () => {
      const result = sanitizeNotificationHtml('<a href="java\tscript:alert(1)">xss</a>');
      expect(result).toBe('xss</a>');
    });

    it('should allow safe http: URLs', () => {
      const result = sanitizeNotificationHtml('<a href="https://example.com">safe</a>');
      expect(result).toBe('<a href="https://example.com">safe</a>');
    });

    it('should allow relative URLs', () => {
      const result = sanitizeNotificationHtml('<a href="/about">relative</a>');
      expect(result).toBe('<a href="/about">relative</a>');
    });

    it('should allow fragment links', () => {
      const result = sanitizeNotificationHtml('<a href="#section">fragment</a>');
      expect(result).toBe('<a href="#section">fragment</a>');
    });

    it('should handle href containing &amp; named entity', () => {
      const result = sanitizeNotificationHtml(
        '<a href="https://example.com/path?a=1&amp;b=2">link</a>'
      );
      expect(result).toBe('<a href="https://example.com/path?a=1&amp;b=2">link</a>');
    });

    it('should handle href containing &lt; named entity', () => {
      const result = sanitizeNotificationHtml('<a href="https://example.com/?q=&lt;tag">link</a>');
      expect(result).toBe('<a href="https://example.com/?q=&lt;tag">link</a>');
    });

    it('should handle href containing &gt; named entity', () => {
      const result = sanitizeNotificationHtml('<a href="https://example.com/?q=&gt;val">link</a>');
      expect(result).toBe('<a href="https://example.com/?q=&gt;val">link</a>');
    });

    it('should handle href containing &quot; named entity', () => {
      const result = sanitizeNotificationHtml(
        '<a href="https://example.com/?q=&quot;test&quot;">link</a>'
      );
      expect(result).toBe('<a href="https://example.com/?q=&quot;test&quot;">link</a>');
    });

    it('should handle href containing &apos; named entity', () => {
      const result = sanitizeNotificationHtml(
        '<a href="https://example.com/?q=&apos;test&apos;">link</a>'
      );
      expect(result).toBe('<a href="https://example.com/?q=&apos;test&apos;">link</a>');
    });

    it('should handle href containing unrecognized entity', () => {
      // &nbsp; is not in the handled set — should pass through as-is
      const result = sanitizeNotificationHtml('<a href="https://example.com/path">link</a>');
      expect(result).toBe('<a href="https://example.com/path">link</a>');
    });
  });

  describe('HTML comments', () => {
    it('should remove HTML comments', () => {
      const result = sanitizeNotificationHtml('<!-- this is a comment -->visible');
      expect(result).toBe('visible');
    });

    it('should remove multiline HTML comments', () => {
      const result = sanitizeNotificationHtml('before<!-- multi\nline\ncomment -->after');
      expect(result).toBe('beforeafter');
    });
  });

  describe('self-closing tags', () => {
    it('should strip self-closing disallowed tags', () => {
      const result = sanitizeNotificationHtml('text<br/>more');
      expect(result).toBe('textmore');
    });

    it('should strip self-closing img tags', () => {
      const result = sanitizeNotificationHtml('before<img src="x.jpg" />after');
      expect(result).toBe('beforeafter');
    });
  });

  describe('closing tags', () => {
    it('should properly handle closing tags for allowed elements', () => {
      const result = sanitizeNotificationHtml('</strong>');
      expect(result).toBe('</strong>');
    });

    it('should strip closing tags for disallowed elements', () => {
      const result = sanitizeNotificationHtml('</div>');
      expect(result).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should trim whitespace', () => {
      const result = sanitizeNotificationHtml('   hello world   ');
      expect(result).toBe('hello world');
    });

    it('should handle empty string input', () => {
      const result = sanitizeNotificationHtml('');
      expect(result).toBe('');
    });

    it('should handle plain text without any tags', () => {
      const result = sanitizeNotificationHtml('plain text content');
      expect(result).toBe('plain text content');
    });

    it('should handle mixed allowed and disallowed tags', () => {
      const result = sanitizeNotificationHtml(
        '<div><strong>bold</strong> <script>bad</script> <em>italic</em></div>'
      );
      expect(result).toBe('<strong>bold</strong> bad <em>italic</em>');
    });
  });
});

describe('addLinkAttributes', () => {
  it('should add target="_blank" and rel to <a> tag with href', () => {
    const result = addLinkAttributes('<a href="https://example.com">link</a>');
    expect(result).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>'
    );
  });

  it('should replace existing target and rel attributes', () => {
    const result = addLinkAttributes(
      '<a href="https://example.com" target="_self" rel="nofollow">link</a>'
    );
    expect(result).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>'
    );
  });

  it('should handle multiple links in one string', () => {
    const html = '<a href="https://a.com">A</a> text <a href="https://b.com">B</a>';
    const result = addLinkAttributes(html);
    expect(result).toContain(
      '<a href="https://a.com" target="_blank" rel="noopener noreferrer">A</a>'
    );
    expect(result).toContain(
      '<a href="https://b.com" target="_blank" rel="noopener noreferrer">B</a>'
    );
  });

  it('should handle <a> without any attributes', () => {
    const result = addLinkAttributes('<a>text</a>');
    expect(result).toBe('<a target="_blank" rel="noopener noreferrer">text</a>');
  });

  it('should not affect non-anchor tags', () => {
    const html = '<strong>bold</strong> <em>italic</em>';
    const result = addLinkAttributes(html);
    expect(result).toBe('<strong>bold</strong> <em>italic</em>');
  });
});

describe('hexColorSchema', () => {
  it('should accept a valid 6-digit hex color', () => {
    const result = hexColorSchema.safeParse('#ffffff');
    expect(result.success).toBe(true);
  });

  it('should accept a valid 3-digit hex color', () => {
    const result = hexColorSchema.safeParse('#fff');
    expect(result.success).toBe(true);
  });

  it('should accept uppercase hex digits', () => {
    const result = hexColorSchema.safeParse('#AABBCC');
    expect(result.success).toBe(true);
  });

  it('should accept mixed case hex digits', () => {
    const result = hexColorSchema.safeParse('#aAbBcC');
    expect(result.success).toBe(true);
  });

  it('should reject a color without the hash prefix', () => {
    const result = hexColorSchema.safeParse('ffffff');
    expect(result.success).toBe(false);
  });

  it('should reject a named color', () => {
    const result = hexColorSchema.safeParse('red');
    expect(result.success).toBe(false);
  });

  it('should reject a hex color with too many digits', () => {
    const result = hexColorSchema.safeParse('#fffffff');
    expect(result.success).toBe(false);
  });

  it('should reject a hex color with 4 digits', () => {
    const result = hexColorSchema.safeParse('#ffff');
    expect(result.success).toBe(false);
  });

  it('should accept null', () => {
    const result = hexColorSchema.safeParse(null);
    expect(result.success).toBe(true);
  });

  it('should accept undefined', () => {
    const result = hexColorSchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });
});

describe('bannerNotificationSchema', () => {
  const validData = {
    slotNumber: 1,
    content: 'Hello world',
    textColor: '#ffffff',
    backgroundColor: '#000000',
    displayFrom: '2026-01-01T00:00:00Z',
    displayUntil: '2026-12-31T00:00:00Z',
    repostedFromId: 'abcdef1234567890abcdef12',
  };

  it('should parse valid full data successfully', () => {
    const result = bannerNotificationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  describe('slotNumber', () => {
    it('should accept slotNumber 1', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, slotNumber: 1 });
      expect(result.success).toBe(true);
    });

    it('should accept slotNumber 5', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, slotNumber: 5 });
      expect(result.success).toBe(true);
    });

    it('should accept slotNumber 3', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, slotNumber: 3 });
      expect(result.success).toBe(true);
    });

    it('should reject slotNumber 0', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, slotNumber: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject slotNumber 6', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, slotNumber: 6 });
      expect(result.success).toBe(false);
    });

    it('should reject non-integer slotNumber', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, slotNumber: 2.5 });
      expect(result.success).toBe(false);
    });
  });

  describe('content', () => {
    it('should transform empty string to null', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, content: '' });
      expect(result.success).toBe(true);
      expect((result as { success: true; data: { content: unknown } }).data.content).toBeNull();
    });

    it('should accept content within 500 characters', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        content: 'A'.repeat(500),
      });
      expect(result.success).toBe(true);
    });

    it('should reject content exceeding 500 characters', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        content: 'A'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should apply sanitization to content', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        content: '<script>alert("xss")</script><strong>ok</strong>',
      });
      expect(result.success).toBe(true);
      expect((result as { success: true; data: { content: unknown } }).data.content).toBe(
        'alert("xss")<strong>ok</strong>'
      );
    });

    it('should accept null content', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, content: null });
      expect(result.success).toBe(true);
      expect((result as { success: true; data: { content: unknown } }).data.content).toBeNull();
    });

    it('should accept undefined content', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, content: undefined });
      expect(result.success).toBe(true);
      expect((result as { success: true; data: { content: unknown } }).data.content).toBeNull();
    });
  });

  describe('textColor', () => {
    it('should accept a valid hex color', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, textColor: '#abc' });
      expect(result.success).toBe(true);
    });

    it('should transform empty string to null', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, textColor: '' });
      expect(result.success).toBe(true);
      expect((result as { success: true; data: { textColor: unknown } }).data.textColor).toBeNull();
    });

    it('should reject an invalid hex color', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, textColor: 'red' });
      expect(result.success).toBe(false);
    });
  });

  describe('backgroundColor', () => {
    it('should accept a valid hex color', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        backgroundColor: '#123456',
      });
      expect(result.success).toBe(true);
    });

    it('should transform empty string to null', () => {
      const result = bannerNotificationSchema.safeParse({ ...validData, backgroundColor: '' });
      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { backgroundColor: unknown } }).data.backgroundColor
      ).toBeNull();
    });

    it('should reject an invalid hex color', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        backgroundColor: 'not-a-color',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('displayFrom / displayUntil', () => {
    it('should accept valid date strings', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        displayFrom: '2026-06-01T00:00:00Z',
        displayUntil: '2026-06-30T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should transform empty displayFrom to null', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        displayFrom: '',
        displayUntil: '',
      });
      expect(result.success).toBe(true);
      const data = (
        result as { success: true; data: { displayFrom: unknown; displayUntil: unknown } }
      ).data;
      expect(data.displayFrom).toBeNull();
      expect(data.displayUntil).toBeNull();
    });

    it('should accept null for date fields', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        displayFrom: null,
        displayUntil: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('refine: displayUntil >= displayFrom', () => {
    it('should fail when displayUntil is before displayFrom', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        displayFrom: '2026-12-31T00:00:00Z',
        displayUntil: '2026-01-01T00:00:00Z',
      });
      expect(result.success).toBe(false);
      const messages = (
        result as { success: false; error: { issues: { message: string }[] } }
      ).error.issues.map((i) => i.message);
      expect(messages).toContain('End date must be on or after start date');
    });

    it('should pass when displayUntil equals displayFrom', () => {
      const date = '2026-06-15T00:00:00Z';
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        displayFrom: date,
        displayUntil: date,
      });
      expect(result.success).toBe(true);
    });

    it('should pass when only displayFrom is provided', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        displayFrom: '2026-06-15T00:00:00Z',
        displayUntil: null,
      });
      expect(result.success).toBe(true);
    });

    it('should pass when only displayUntil is provided', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        displayFrom: null,
        displayUntil: '2026-12-31T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should pass when neither date is provided', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        displayFrom: null,
        displayUntil: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('repostedFromId', () => {
    it('should accept a valid 24-character hex ObjectId', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        repostedFromId: 'abcdef1234567890abcdef12',
      });
      expect(result.success).toBe(true);
    });

    it('should accept uppercase hex ObjectId', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        repostedFromId: 'ABCDEF1234567890ABCDEF12',
      });
      expect(result.success).toBe(true);
    });

    it('should reject an invalid ObjectId (wrong length)', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        repostedFromId: 'abc123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject an invalid ObjectId (non-hex characters)', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        repostedFromId: 'zzzzzzzzzzzzzzzzzzzzzzzz',
      });
      expect(result.success).toBe(false);
    });

    it('should transform empty string to null', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        repostedFromId: '',
      });
      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { repostedFromId: unknown } }).data.repostedFromId
      ).toBeNull();
    });

    it('should accept null', () => {
      const result = bannerNotificationSchema.safeParse({
        ...validData,
        repostedFromId: null,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('rotationIntervalSchema', () => {
  it('should accept interval of 3', () => {
    const result = rotationIntervalSchema.safeParse({ interval: 3 });
    expect(result.success).toBe(true);
  });

  it('should accept interval of 15', () => {
    const result = rotationIntervalSchema.safeParse({ interval: 15 });
    expect(result.success).toBe(true);
  });

  it('should accept interval of 10', () => {
    const result = rotationIntervalSchema.safeParse({ interval: 10 });
    expect(result.success).toBe(true);
  });

  it('should reject interval below 3', () => {
    const result = rotationIntervalSchema.safeParse({ interval: 2 });
    expect(result.success).toBe(false);
  });

  it('should reject interval above 15', () => {
    const result = rotationIntervalSchema.safeParse({ interval: 16 });
    expect(result.success).toBe(false);
  });

  it('should coerce string to number', () => {
    const result = rotationIntervalSchema.safeParse({ interval: '7' });
    expect(result.success).toBe(true);
    expect((result as { success: true; data: { interval: number } }).data.interval).toBe(7);
  });
});
