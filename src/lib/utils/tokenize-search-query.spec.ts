/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MAX_SEARCH_TOKENS, tokenizeSearchQuery } from './tokenize-search-query';

describe('tokenizeSearchQuery', () => {
  it('splits a query on whitespace', () => {
    expect(tokenizeSearchQuery('john smith')).toEqual(['john', 'smith']);
  });

  it('collapses runs of whitespace, tabs, and newlines', () => {
    expect(tokenizeSearchQuery('  john \t\n  smith  ')).toEqual(['john', 'smith']);
  });

  it('trims punctuation from the edges of a token', () => {
    expect(tokenizeSearchQuery('Dr. John Q. Smith, Jr.')).toEqual([
      'Dr',
      'John',
      'Q',
      'Smith',
      'Jr',
    ]);
  });

  it('keeps punctuation inside a token', () => {
    expect(tokenizeSearchQuery("D.J. O'Brien AC/DC")).toEqual(['D.J', "O'Brien", 'AC/DC']);
  });

  it('drops tokens that are only punctuation', () => {
    expect(tokenizeSearchQuery('john - & smith')).toEqual(['john', 'smith']);
  });

  it('keeps non-Latin letters and digits', () => {
    expect(tokenizeSearchQuery('Björk 22 坂本')).toEqual(['Björk', '22', '坂本']);
  });

  it('drops repeated tokens case-insensitively, keeping the first', () => {
    expect(tokenizeSearchQuery('Ceschi ceschi CESCHI live')).toEqual(['Ceschi', 'live']);
  });

  it('returns no tokens for an empty query', () => {
    expect(tokenizeSearchQuery('')).toEqual([]);
  });

  it('returns no tokens for a whitespace-and-punctuation-only query', () => {
    expect(tokenizeSearchQuery('  . , -  ')).toEqual([]);
  });

  it('caps the token count', () => {
    const query = Array.from({ length: MAX_SEARCH_TOKENS + 5 }, (_, index) => `t${index}`).join(
      ' '
    );

    expect(tokenizeSearchQuery(query)).toHaveLength(MAX_SEARCH_TOKENS);
  });
});
