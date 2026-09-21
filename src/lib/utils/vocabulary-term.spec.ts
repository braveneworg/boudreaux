/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  formatVocabularyTerm,
  normalizeVocabularyList,
  normalizeVocabularyTerm,
} from './vocabulary-term';

describe('normalizeVocabularyTerm', () => {
  it('lowercases and dasherizes a multi-word term', () => {
    expect(normalizeVocabularyTerm('Indie Rock')).toBe('indie-rock');
  });

  it('collapses runs of whitespace and trims the edges', () => {
    expect(normalizeVocabularyTerm('  POST  PUNK ')).toBe('post-punk');
  });

  it('expands an ampersand to "and" before slugifying', () => {
    expect(normalizeVocabularyTerm('R&B')).toBe('r-and-b');
  });

  it('expands a plus sign to "and"', () => {
    expect(normalizeVocabularyTerm('Drum + Bass')).toBe('drum-and-bass');
  });

  it('leaves an already normalised term unchanged', () => {
    expect(normalizeVocabularyTerm('hip-hop')).toBe('hip-hop');
  });

  it('returns an empty string for punctuation-only input', () => {
    expect(normalizeVocabularyTerm('!!!')).toBe('');
  });
});

describe('formatVocabularyTerm', () => {
  it('title-cases a dashed term', () => {
    expect(formatVocabularyTerm('indie-rock')).toBe('Indie Rock');
  });

  it('title-cases a single word', () => {
    expect(formatVocabularyTerm('punk')).toBe('Punk');
  });

  it('applies the lo-fi override', () => {
    expect(formatVocabularyTerm('lo-fi')).toBe('Lo-Fi');
  });

  it('applies the hip-hop override', () => {
    expect(formatVocabularyTerm('hip-hop')).toBe('Hip-Hop');
  });

  it('applies the r-and-b override', () => {
    expect(formatVocabularyTerm('r-and-b')).toBe('R&B');
  });

  it('applies the dnb override', () => {
    expect(formatVocabularyTerm('dnb')).toBe('DnB');
  });

  it('normalises before looking up an override', () => {
    expect(formatVocabularyTerm('Hip Hop')).toBe('Hip-Hop');
  });

  it('returns an empty string for an empty term', () => {
    expect(formatVocabularyTerm('')).toBe('');
  });
});

describe('normalizeVocabularyList', () => {
  it('normalises every item of a comma-joined list', () => {
    expect(normalizeVocabularyList('Indie Rock, Post Punk')).toBe('indie-rock,post-punk');
  });

  it('drops duplicates that differ only by case or spacing', () => {
    expect(normalizeVocabularyList('Punk, punk,  PUNK ')).toBe('punk');
  });

  it('drops items that normalise to nothing', () => {
    expect(normalizeVocabularyList('Punk, !!!, Noise')).toBe('punk,noise');
  });

  it('preserves the given order', () => {
    expect(normalizeVocabularyList('Noise, Ambient, Drone')).toBe('noise,ambient,drone');
  });

  it('returns null for a list with no usable items', () => {
    expect(normalizeVocabularyList(' , !!! , ')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(normalizeVocabularyList('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(normalizeVocabularyList(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizeVocabularyList(undefined)).toBeNull();
  });
});
