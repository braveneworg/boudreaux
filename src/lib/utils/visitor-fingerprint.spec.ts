/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  computeFingerprintHash,
  truncateIp,
  type FingerprintInput,
} from '@/lib/utils/visitor-fingerprint';

describe('visitor-fingerprint', () => {
  describe('truncateIp', () => {
    it('returns empty string for null / undefined / empty input', () => {
      expect(truncateIp(null)).toBe('');
      expect(truncateIp(undefined)).toBe('');
      expect(truncateIp('')).toBe('');
      expect(truncateIp('   ')).toBe('');
    });

    it('truncates IPv4 to /24 prefix', () => {
      expect(truncateIp('203.0.113.42')).toBe('203.0.113.0/24');
      expect(truncateIp('192.168.1.1')).toBe('192.168.1.0/24');
    });

    it('truncates IPv4-mapped IPv6 to its /24 prefix', () => {
      expect(truncateIp('::ffff:203.0.113.42')).toBe('203.0.113.0/24');
    });

    it('truncates full IPv6 to /64 prefix', () => {
      expect(truncateIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3:8d3::/64');
    });

    it('truncates compressed IPv6 to /64 prefix', () => {
      expect(truncateIp('2001:db8::1')).toBe('2001:db8:0:0::/64');
    });

    it('handles leading-:: shorthand (head is empty)', () => {
      expect(truncateIp('::1')).toBe('0:0:0:0::/64');
    });

    it('treats empty hextets in expanded form as 0', () => {
      // Leading single colon causes the first part to be the empty string,
      // which exercises the `h ? h.toLowerCase() : '0'` branch.
      expect(truncateIp(':1:2:3:4:5:6:7')).toBe('0:1:2:3::/64');
    });

    it('falls back to a raw split when expansion would over-fill', () => {
      // 8 head hextets plus a tail hextet around `::` makes `missing` negative.
      expect(truncateIp('1:2:3:4:5:6:7:8::9')).toBe('1:2:3:4::/64');
    });

    it('returns empty string for unparseable input', () => {
      expect(truncateIp('not-an-ip')).toBe('');
      expect(truncateIp('999.999.999.999')).toBe('');
    });
  });

  describe('computeFingerprintHash', () => {
    const baseInput: FingerprintInput = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      acceptLanguage: 'en-US,en;q=0.9',
      ip: '203.0.113.42',
    };

    it('returns a 64-character lowercase hex digest', () => {
      const hash = computeFingerprintHash(baseInput);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for identical inputs', () => {
      expect(computeFingerprintHash(baseInput)).toBe(computeFingerprintHash(baseInput));
    });

    it('returns the same hash for two IPs in the same /24', () => {
      const a = computeFingerprintHash({ ...baseInput, ip: '203.0.113.1' });
      const b = computeFingerprintHash({ ...baseInput, ip: '203.0.113.255' });
      expect(a).toBe(b);
    });

    it('returns different hashes for IPs in different /24s', () => {
      const a = computeFingerprintHash({ ...baseInput, ip: '203.0.113.1' });
      const b = computeFingerprintHash({ ...baseInput, ip: '203.0.114.1' });
      expect(a).not.toBe(b);
    });

    it('returns the same hash for two IPv6 addresses in the same /64', () => {
      const a = computeFingerprintHash({ ...baseInput, ip: '2001:db8:85a3:8d3:1::1' });
      const b = computeFingerprintHash({ ...baseInput, ip: '2001:db8:85a3:8d3:ffff::ffff' });
      expect(a).toBe(b);
    });

    it('coerces missing UA / Accept-Language to empty string deterministically', () => {
      const a = computeFingerprintHash({
        userAgent: null,
        acceptLanguage: null,
        ip: '203.0.113.42',
      });
      const b = computeFingerprintHash({ userAgent: '', acceptLanguage: '', ip: '203.0.113.42' });
      const c = computeFingerprintHash({
        userAgent: undefined,
        acceptLanguage: undefined,
        ip: '203.0.113.42',
      });
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it('produces different hashes when User-Agent changes', () => {
      const a = computeFingerprintHash(baseInput);
      const b = computeFingerprintHash({ ...baseInput, userAgent: 'curl/8.0.0' });
      expect(a).not.toBe(b);
    });

    it('produces different hashes when Accept-Language changes', () => {
      const a = computeFingerprintHash(baseInput);
      const b = computeFingerprintHash({ ...baseInput, acceptLanguage: 'fr-CA,fr;q=0.9' });
      expect(a).not.toBe(b);
    });

    it('produces a deterministic hash even when IP is missing', () => {
      const a = computeFingerprintHash({ ...baseInput, ip: null });
      const b = computeFingerprintHash({ ...baseInput, ip: '' });
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
