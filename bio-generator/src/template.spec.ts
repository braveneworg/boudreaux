/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readFileSync } from 'node:fs';

// Comments are stripped so prose may mention the env var; only live wiring counts.
const template = readFileSync(new URL('../template.yaml', import.meta.url), 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n');

describe('template.yaml Gemini model wiring', () => {
  // CloudFormation keeps a parameter's previous value on stack updates
  // (UsePreviousValue) unless the deploy passes it explicitly, so a GeminiModel
  // parameter default silently pinned the retired gemini-3-flash id in
  // production long after the code default changed. The model id must ship in
  // code (DEFAULT_GEMINI_MODEL) only.
  it('does not route the model id through a CloudFormation parameter', () => {
    expect(template).not.toContain('GeminiModel');
  });

  it('does not pin GEMINI_MODEL in the Lambda environment', () => {
    expect(template).not.toContain('GEMINI_MODEL');
  });
});

describe('template.yaml Serper wiring', () => {
  it('grants read access to the Serper API-key SSM parameter', () => {
    expect(template).toContain(':parameter/fakefour/serper/api-key');
  });

  it('wires the Serper SSM path into the Lambda environment', () => {
    expect(template).toContain("SSM_PATH_SERPER_API_KEY: '/fakefour/serper/api-key'");
  });
});

describe('template.yaml function timeout', () => {
  // The draft-and-synthesize pipeline runs two parallel drafts plus an editor
  // pass, each with up to 90s of 429 backoff — the worst case no longer fits
  // the old 600s budget, so the function needs the Lambda maximum.
  it('allows the two-phase ensemble worst case (Lambda max, 900s)', () => {
    expect(template).toContain('Timeout: 900');
  });
});
