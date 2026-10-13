/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { join } from 'path';

const HOOK = join(__dirname, '..', '.claude', 'hooks', 'factory-guard.sh');

interface GuardResult {
  status: number;
  stderr: string;
}

/** Runs the Guard the way the harness does: the hook JSON on stdin. */
const guard = (command: string): GuardResult => {
  const input = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command },
    cwd: __dirname,
  });
  const result = spawnSync('bash', [HOOK], { encoding: 'utf8', input });
  return { status: result.status ?? -1, stderr: result.stderr ?? '' };
};

describe('factory-guard.sh', () => {
  describe('blocks by default', () => {
    it('gh pr merge', () => {
      const { status, stderr } = guard('gh pr merge 866 --squash');
      expect(status).toBe(2);
      expect(stderr).toContain('gh pr merge is blocked');
    });

    it('git merge', () => {
      const { status, stderr } = guard('git merge origin/main');
      expect(status).toBe(2);
      expect(stderr).toContain('git merge is blocked');
    });

    it('git push to main', () => {
      expect(guard('git push origin HEAD:main').status).toBe(2);
    });

    it('a merge later in a chain', () => {
      expect(guard('git fetch origin && gh pr merge 866 --squash').status).toBe(2);
    });
  });

  describe('lets through', () => {
    it('git merge-base and merge-tree', () => {
      expect(guard('git merge-base origin/main HEAD').status).toBe(0);
      expect(guard('git merge-tree --write-tree a b').status).toBe(0);
    });

    it('gh pr view', () => {
      expect(guard('gh pr view 866 --json mergeable').status).toBe(0);
    });
  });

  describe('the merge opt-in', () => {
    // The user asked for the merge in so many words; the agent records that
    // by prefixing the one command with the variable, where the permission
    // prompt and the transcript both show it. The guard reads the prefix off
    // the simple command itself, not the environment, so it covers exactly
    // that command and nothing else in the chain.
    it('allows gh pr merge when the command carries FACTORY_GUARD_USER_MERGE=1', () => {
      expect(guard('FACTORY_GUARD_USER_MERGE=1 gh pr merge 866 --squash').status).toBe(0);
    });

    it('allows git merge under the same prefix', () => {
      expect(guard('FACTORY_GUARD_USER_MERGE=1 git merge origin/main').status).toBe(0);
    });

    it('still blocks git push to main and git push --force', () => {
      expect(guard('FACTORY_GUARD_USER_MERGE=1 git push origin HEAD:main').status).toBe(2);
      expect(guard('FACTORY_GUARD_USER_MERGE=1 git push --force').status).toBe(2);
    });

    it('covers only the simple command it prefixes', () => {
      const { status, stderr } = guard(
        'FACTORY_GUARD_USER_MERGE=1 gh pr view 866 && gh pr merge 866 --squash'
      );
      expect(status).toBe(2);
      expect(stderr).toContain('gh pr merge is blocked');
    });

    it('ignores any other value than 1', () => {
      expect(guard('FACTORY_GUARD_USER_MERGE=yes gh pr merge 866 --squash').status).toBe(2);
      expect(guard('FACTORY_GUARD_USER_MERGE= gh pr merge 866 --squash').status).toBe(2);
    });

    it('ignores the variable when it is exported rather than prefixed', () => {
      expect(guard('export FACTORY_GUARD_USER_MERGE=1; gh pr merge 866 --squash').status).toBe(2);
    });
  });
});
