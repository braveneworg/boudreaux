#!/usr/bin/env bash
#
# Clean: removes the worktree and branch of every factory Job whose pull
# request was merged.
#
# Run from the repo's main checkout:
#   bash factory/clean.sh            remove them
#   bash factory/clean.sh --dry-run  only say what would be removed
#
# For each closed issue labeled `factory`, it reads the PR URL from the latest
# `## pr` comment and asks GitHub whether that PR was merged. If it was, it
# takes the worktree and branch from the latest `## state` comment and runs
# `git worktree remove` and `git branch -d`, never their forcing forms, so a
# worktree with uncommitted changes or an unmerged branch is reported and
# kept. Issue comments can come from anyone who can comment on the repo, so
# the PR must be in this repo with the state's branch as its head, the
# worktree must have that branch checked out, and only factory/ branches and
# worktrees under <repo>/.claude/worktrees/ are touched.
#
# Prints one line per issue: `removed #<n>: ...`, `would remove #<n>: ...` or
# `skip #<n>: <reason>`. Exits non-zero only when the repo or its issues
# cannot be read.
# Needs git and gh; gh's built-in --jq reads the JSON.

set -uo pipefail

dry_run=false
case "$#:${1:-}" in
  "0:") ;;
  "1:--dry-run") dry_run=true ;;
  *)
    printf 'Usage: bash factory/clean.sh [--dry-run]\n' >&2
    exit 1
    ;;
esac

repo="$(git rev-parse --show-toplevel)" || exit 1
repo_url="$(gh repo view --json url -q .url)" || exit 1
worktrees_dir="$repo/.claude/worktrees/"
sep=$'\037'

# One line per closed job: number, PR URL, worktree, branch, separated by
# the unit separator so an empty field stays a field. The latest comment with
# a heading wins; the state comment's JSON sits in a code fence.
JOBS_FILTER='
  .[]
  | [ .comments[].body | gsub("\r"; "") | split("\n") ] as $comments
  | ([ $comments[] | select(.[0] | sub("\\s+$"; "") == "## pr") ] | last // [] | .[1] // "" | sub("\\s+$"; "")) as $pr
  | ([ $comments[] | select(.[0] | sub("\\s+$"; "") == "## state") ] | last // [] | .[1:]
      | map(select(startswith("```") | not)) | join("\n") | (fromjson? // {})) as $state
  | [ (.number | tostring), $pr, ($state.worktree // "" | tostring), ($state.branch // "" | tostring) ]
  | join("\u001f")'

jobs="$(gh issue list --label factory --state closed -L 500 --json number,comments --jq "$JOBS_FILTER")" \
  || exit 1

# Prints the last line of $1, the part of git's or gh's error that says why.
last_line() {
  printf '%s\n' "$1" | sed -n '$p'
}

# Cleans the job of issue $1, whose PR URL is $2, worktree $3 and branch $4.
clean_job() {
  local number="$1" pr_url="$2" worktree="$3" branch="$4"
  local pr merged_at head errors done_what="" verb="removed"
  local line registered=false checked_out=""

  if [ -z "$pr_url" ]; then
    printf 'skip #%s: no ## pr comment\n' "$number"
    return
  fi
  case "$pr_url" in
    "$repo_url/pull/"[0-9]*) ;;
    *) printf 'skip #%s: pull request %s is not in %s\n' "$number" "$pr_url" "$repo_url"; return ;;
  esac
  if ! pr="$(gh pr view "$pr_url" --json mergedAt,headRefName \
    --jq '"\(.mergedAt // "")\u001f\(.headRefName)"' 2>&1)"; then
    printf 'skip #%s: could not read %s: %s\n' "$number" "$pr_url" "$(last_line "$pr")"
    return
  fi
  merged_at="${pr%%"$sep"*}"
  head="${pr#*"$sep"}"
  if [ -z "$merged_at" ]; then
    printf 'skip #%s: pull request not merged: %s\n' "$number" "$pr_url"
    return
  fi
  if [ -z "$worktree" ] || [ -z "$branch" ]; then
    printf 'skip #%s: no worktree and branch in the ## state comment\n' "$number"
    return
  fi
  case "$branch" in
    factory/?*) ;;
    *) printf 'skip #%s: branch %s is not a factory/ branch\n' "$number" "$branch"; return ;;
  esac
  if [ "$head" != "$branch" ]; then
    printf 'skip #%s: pull request head %s is not branch %s\n' "$number" "$head" "$branch"
    return
  fi
  case "$worktree" in
    */../* | */..) printf 'skip #%s: worktree %s is not under %s\n' "$number" "$worktree" "$worktrees_dir"; return ;;
    "$worktrees_dir"?*) ;;
    *) printf 'skip #%s: worktree %s is not under %s\n' "$number" "$worktree" "$worktrees_dir"; return ;;
  esac

  # The worktree's block in `git worktree list --porcelain`, if registered,
  # says which branch it has checked out.
  while IFS= read -r line; do
    case "$line" in
      "worktree $worktree") registered=true ;;
      "") [ "$registered" = true ] && break ;;
      "branch refs/heads/"*) [ "$registered" = true ] && checked_out="${line#branch refs/heads/}" ;;
    esac
  done < <(git worktree list --porcelain)
  if [ "$registered" = true ] && [ "$checked_out" != "$branch" ]; then
    printf 'skip #%s: worktree %s is not checked out on branch %s\n' "$number" "$worktree" "$branch"
    return
  fi

  [ "$dry_run" = true ] && verb="would remove"

  if [ "$registered" = true ]; then
    if [ "$dry_run" = false ] && ! errors="$(git worktree remove "$worktree" 2>&1)"; then
      printf 'skip #%s: git worktree remove refused: %s\n' "$number" "$(last_line "$errors")"
      return
    fi
    done_what="worktree $worktree"
  fi

  if git show-ref --verify --quiet "refs/heads/$branch"; then
    if [ "$dry_run" = false ] && ! errors="$(git branch -d "$branch" 2>&1)"; then
      if [ -n "$done_what" ]; then
        printf 'removed #%s: %s; kept branch %s, git branch -d refused: %s\n' \
          "$number" "$done_what" "$branch" "$(last_line "$errors")"
      else
        printf 'skip #%s: git branch -d refused: %s\n' "$number" "$(last_line "$errors")"
      fi
      return
    fi
    done_what="${done_what:+$done_what, }branch $branch"
  fi

  if [ -z "$done_what" ]; then
    printf 'skip #%s: already clean\n' "$number"
  else
    printf '%s #%s: %s\n' "$verb" "$number" "$done_what"
  fi
}

while IFS="$sep" read -r number pr_url worktree branch; do
  [ -n "$number" ] || continue
  clean_job "$number" "$pr_url" "$worktree" "$branch"
done <<< "$jobs"

exit 0
