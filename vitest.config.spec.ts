/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { existsSync, readFileSync } from 'node:fs';

import config, { SHELL_SCRIPT_SPECS } from './vitest.config';

interface ProjectShape {
  test?: { name?: string; include?: string[]; exclude?: string[] };
}

const SHELL_PROJECT = 'shell-scripts';

/** Evaluate the config factory under the current (stubbed) environment. */
const resolveProjects = async (): Promise<ProjectShape[]> => {
  const resolved = await (typeof config === 'function'
    ? config({ command: 'serve', mode: 'test' })
    : config);
  const { projects = [] } = resolved.test ?? {};
  return projects as ProjectShape[];
};

const projectNames = (projects: ProjectShape[]): string[] =>
  projects.map(({ test }) => test?.name ?? '');

describe('vitest.config — shell-script specs', () => {
  beforeEach(() => {
    vi.stubEnv('CI', '');
    vi.stubEnv('VITEST_SHELL_SPECS', '');
  });

  it.each(SHELL_SCRIPT_SPECS)('%s exists', (spec) => {
    expect(existsSync(spec)).toBe(true);
  });

  it.each(SHELL_SCRIPT_SPECS)('%s drives a shell script through a child process', (spec) => {
    expect(readFileSync(spec, 'utf8')).toMatch(/spawnSync|execFileSync|execSync/);
  });

  it('leaves them out of every project in a plain local run', async () => {
    const projects = await resolveProjects();

    expect(projectNames(projects)).not.toContain(SHELL_PROJECT);
    for (const { test } of projects) {
      expect(test?.exclude).toEqual(expect.arrayContaining([...SHELL_SCRIPT_SPECS]));
    }
  });

  it('runs them under the shell-scripts project in CI', async () => {
    vi.stubEnv('CI', 'true');

    const projects = await resolveProjects();
    const shell = projects.find(({ test }) => test?.name === SHELL_PROJECT);

    expect(shell?.test?.include).toEqual([...SHELL_SCRIPT_SPECS]);
  });

  it('runs them locally on demand with VITEST_SHELL_SPECS=1', async () => {
    vi.stubEnv('VITEST_SHELL_SPECS', '1');

    const projects = await resolveProjects();

    expect(projectNames(projects)).toContain(SHELL_PROJECT);
  });
});
