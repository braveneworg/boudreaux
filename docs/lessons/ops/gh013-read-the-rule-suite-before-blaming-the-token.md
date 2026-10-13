# GH013 on the release push: read the rule suite, not the token

The deploy workflow's `version-bump` job pushes `chore(release): vX.Y.Z`
straight to `main` with the user's fine-grained PAT (`GHCR_PAT`). The
`main-branch` ruleset requires a pull request, so that push works only
because the PAT's owner is a repository admin and the ruleset lists admins
as bypass actors. Every release push is evaluated as a `bypass`, by design.

On 2026-10-11, between the v4.426.0 release (07:44 ET) and the #861 merge
(16:48 ET), a classic branch protection rule was added on `main` with
"Do not allow bypassing the above settings" (`enforce_admins`) on, as a
backstop against agents committing on `main`. Classic protection has no
bypass list once `enforce_admins` is set, so from the next merge every
release push failed with:

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
```

The first diagnosis blamed the token: the workflow, the checkout action
SHA, the auth setup, the secret's timestamp and the ruleset were all
unchanged between the last good run and the first bad one, and the only
remaining variable looked like the PAT's standing. The user checked the
token, found it valid, re-ran the job, and it failed again. Forty minutes
were spent on a hypothesis the rule-suite log would have refuted in one
call.

Rules:

- A `GH013` is a ruleset or branch-protection decision, so start with the
  evaluation GitHub already recorded:

  ```bash
  gh api 'repos/braveneworg/boudreaux/rulesets/rule-suites?ref=refs/heads/main&per_page=10' \
    --jq '.[] | "\(.pushed_at)\t\(.actor_name)\t\(.result)\t\(.after_sha[0:8])\t\(.id)"'
  gh api repos/braveneworg/boudreaux/rulesets/rule-suites/<id> \
    --jq '.rule_evaluations[] | {rule_type, result, source: .rule_source.name, details}'
  ```

  Compare the last `bypass` suite with the first `fail` suite. A rule
  evaluation whose `rule_source` is `null` comes from classic branch
  protection, not from any ruleset, and `gh api repos/<repo>/rules/branches/main`
  does not list it. Check `gh api repos/<repo>/branches/main/protection` too.

- "Nothing changed in the repo or the workflow" means the change is in
  GitHub settings. Enumerate those (rulesets, classic protection,
  collaborators, secrets' `updated_at`) before reasoning about what a token
  might have lost.
- `main` has one rule system: the `main-branch` ruleset. Do not add classic
  branch protection on top of it. A rule that blocks admins also blocks the
  release bot, because the release bot _is_ an admin's PAT. If `main` must
  ever block admins, first give the release job its own identity (a GitHub
  App on the bypass lists) and only then tighten the rule.
- When a release push fails, the tag and commit exist only on the runner.
  After the fix, `gh run rerun <run-id> --failed` releases that version; the
  merges whose deploys failed in between get no changelog entry of their
  own, because the bump step reads only the PR of the commit that triggered
  the run.
