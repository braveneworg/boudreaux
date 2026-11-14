# SAM rejects `Key=` and keeps an omitted parameter's old value

**What happened (2026-11-11).** The re-encode Lambda's stack has two optional
parameters, `AlarmEmail` and `AppPrincipalArn`, each filled from a repository
secret or variable that may be unset. Passed to `sam deploy` as
`--parameter-overrides AlarmEmail=$ALERT_EMAIL`, an unset value becomes the
bare `AlarmEmail=`, which SAM's parser rejects. Leaving the parameter out
when it is empty does not clear it either: CloudFormation then keeps the
value the stack was last deployed with.

**The rule.** Always pass an optional parameter, quoted, so an unset value
reaches CloudFormation as an empty string: `"Key=\"${VALUE}\""`.

**How to apply.**

- In a deploy workflow, put the secret or variable in `env:` and write the
  override as `"AppPrincipalArn=\"${APP_PRINCIPAL_ARN}\""`, as
  `deploy-submission-reencoder.yml` does.
- Do not build the override list conditionally. An override that is sometimes
  absent means a value can be set and then never unset.
- `deploy-bio-generator.yml` passes `AlarmEmail=${{ secrets.ALERT_EMAIL }}`
  unquoted. It works while the secret is set, and would fail the same way if
  it were removed.
