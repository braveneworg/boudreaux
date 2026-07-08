/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logEvent, toErrorMessage } from './lib/log.js';
import { findPlagiarizedSegments } from './plagiarism.js';

import type { critiqueProse, reviseProse } from './gemini.js';
import type { ArtistFacts, BioCritiqueViolation, BioProse } from './types.js';

const YEAR_PATTERN = /\b(1[89]\d\d|20\d\d)\b/g;

/** Distinct years in the text strictly earlier than the birth year, ascending. */
export const findYearsBeforeBirth = (html: string, birthYear: number): number[] => {
  const years = new Set<number>();
  for (const match of html.matchAll(YEAR_PATTERN)) {
    const year = Number(match[1]);
    if (year < birthYear) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
};

export interface QualityPassArgs {
  prose: BioProse;
  facts: ArtistFacts;
  apiKey: string;
  model: string;
  /** Paid-tier fallback model passed through to the critic/repair passes (Task 3 wires it). */
  fallbackModel?: string;
}

export interface QualityPassDeps {
  critiqueProse: typeof critiqueProse;
  reviseProse: typeof reviseProse;
}

/**
 * Post-generation quality gate: deterministic year screen + programmatic
 * plagiarism screen feed one critic pass; any finding triggers a single repair
 * pass. Both remote passes degrade gracefully — a failure returns the prose
 * unchanged rather than costing the artist their bio.
 */
export const runQualityPasses = async (
  { prose, facts, apiKey, model, fallbackModel }: QualityPassArgs,
  deps: QualityPassDeps
): Promise<BioProse> => {
  const combined = [prose.shortBio, prose.longBio, prose.altBio].join('\n');
  const birthYear = facts.bornOn ? Number(facts.bornOn.slice(0, 4)) : null;
  const suspectYears = birthYear ? findYearsBeforeBirth(combined, birthYear) : [];
  const plagiarizedSegments = findPlagiarizedSegments(
    combined,
    facts.sourceText ? [facts.sourceText] : []
  );

  let violations: BioCritiqueViolation[] = [];
  try {
    ({ violations } = await deps.critiqueProse({
      facts,
      prose,
      suspectYears,
      apiKey,
      model,
      fallbackModel,
    }));
  } catch (err) {
    logEvent('warn', 'critic_pass_failed', { error: toErrorMessage(err) });
  }

  logEvent('info', 'quality_passes', {
    suspectYears: suspectYears.length,
    plagiarizedSegments: plagiarizedSegments.length,
    violations: violations.length,
  });
  if (!violations.length && !plagiarizedSegments.length) return prose;

  try {
    return await deps.reviseProse({
      facts,
      prose,
      violations,
      plagiarizedSegments,
      apiKey,
      model,
      fallbackModel,
    });
  } catch (err) {
    logEvent('warn', 'repair_pass_failed', { error: toErrorMessage(err) });
    return prose;
  }
};
