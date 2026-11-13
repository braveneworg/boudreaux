# Read the role before listing what it lacks

**What happened (2026-11-12).** The re-encode Lambda's stack needs things the
deploy role had never been asked for. The operator steps written with the
feature said the role needed ECR, an S3 bucket, and
`lambda:PutFunctionEventInvokeConfig`. That list was reasoned from the
template alone. Read against the role itself it was wrong twice: the Lambda
action was already there (`AWSLambda_FullAccess`), and the alarm's SNS topic
was missing from the list, because the role's SNS policies name the other two
Lambdas' topics one by one. The first `sam deploy` failed on ECR; the bucket
and the topic would each have cost another failed run.

Two more things came out of the same deploy:

- A failed first deploy leaves SAM's companion stack (the one that owns the
  ECR repository) in `ROLLBACK_COMPLETE`. SAM's next run tries to update it,
  and CloudFormation refuses to update a stack in that state.
- Re-running a finished `CI/CD - Build, Publish, Deploy` run was suggested as
  the way to redeploy the app with new repository variables. Its
  `version-bump` job needs the deploy job, so the re-run would have bumped
  the version and cut a second release for the same pull request. It was
  caught by reading the workflow before the command was run.

**The rule.** Before writing what a role needs, read what it has, and
compare that with every resource type in the template. Before suggesting a
re-run, read which other jobs the re-run takes with it.

**How to apply.**

- `aws iam list-attached-role-policies` and `list-role-policies`, then
  `get-role-policy` for each inline one, are read-only. Check each resource
  type the stack creates against them, and check the `Resource` of each
  statement: a policy scoped to another stack's names does not cover a new
  stack.
- Write the missing permissions as one policy scoped to the new stack's
  resources, and keep it in the repo next to the operator steps.
- After a failed first deploy, list the stacks whose name starts with the
  stack's name and delete any in `ROLLBACK_COMPLETE` before the retry.
- The app's deploy has no manual trigger. New repository variables reach the
  host on the next merge to main.
