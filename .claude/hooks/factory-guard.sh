#!/usr/bin/env bash
#
# The factory Guard: a PreToolUse hook on the Bash tool that blocks the
# commands which would land work on main without a pull request.
#
#   - git merge                       (git merge-base, merge-tree, mergetool pass)
#   - gh pr merge
#   - git push to main                (main, +main, :main, <x>:main, refs/heads/main)
#   - git push --force, -f, -<flags with f>, --force-with-lease[=<...>], +<ref>
#   - git branch -D, -<flags with D>, git branch --delete --force
#   - git commit while the branch is main, read in the directory the earlier
#     `cd <dir>`s and the commit's own `git -C <dir>`s lead to from the
#     session's cwd
#
# The one opt-in: when the user has asked for a merge in so many words, the
# agent prefixes that single command with FACTORY_GUARD_USER_MERGE=1 —
#
#   FACTORY_GUARD_USER_MERGE=1 gh pr merge 866 --squash
#   FACTORY_GUARD_USER_MERGE=1 git merge origin/main
#
# and `gh pr merge` and `git merge` pass for that simple command only. The
# prefix is read off the command text, never the environment, so an exported
# variable or a prefix on an earlier command in the chain changes nothing,
# and the permission prompt and the transcript both show the attestation on
# the merge it covers. Pushes to main and force pushes stay blocked.
#
# A command matches only at a command boundary: the start of the string, or
# after &&, ||, ;, |, ( or a newline outside quotes. NAME=value assignments,
# the shell keywords then, do, else, elif, ! and {, the wrappers env (with its
# options), command, time, nohup, exec, nice, sudo and xargs, and git's global
# options (-C <dir>, -c <x>, --no-pager, ...) before the subcommand are
# skipped, and /usr/bin/git counts as git. Heredoc bodies are skipped, so a
# review comment that quotes `git push --force` passes.
#
# Reads the hook JSON on stdin. Exit 2 blocks the call and the one stderr line
# tells the agent why. Exit 0 allows it. Input it cannot parse is allowed:
# GitHub branch protection on main is the backstop.
#
# Bash 3.2, sed and git only, so it runs in every Target with no JSON tool.

# Bytes, not characters: every character that matters here is ASCII.
export LC_ALL=C

bs='\'
soh=$'\001'

# Prints the JSON string value of key $1 in $input, with the escapes a shell
# command can carry undone: \\ \" \n \t \/. sed, not bash substitution, which
# is quadratic in bash 3.2 and would stall on a long heredoc.
json_field() {
  printf '%s\n' "$input" \
    | sed -nE 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*/\1/p' \
    | sed -e 's/\\\\/'"$soh"'/g' -e 's/\\"/"/g' -e 's/\\t/'$'\t''/g' -e 's|\\/|/|g' \
      -e 's/\\n/\'$'\n''/g' -e 's/'"$soh"'/\\/g'
}

block() {
  printf 'factory-guard: %s is blocked. Land changes through a pull request that a human merges on GitHub.\n' "$1" >&2
  exit 2
}

# Raw newlines in JSON only sit between tokens, so joining lines is safe.
input="$(tr '\n' ' ')"
command="$(json_field command)"
[ -n "$command" ] || exit 0
cwd="$(json_field cwd)"

# --- split the command into simple commands ----------------------------------

segments=()
segment=""
quote=""        # the open quote character, if any
heredoc=""      # delimiter of a heredoc whose body starts on the next line
body_end=""     # delimiter that ends the heredoc body being skipped
heredoc_re="^-?[[:space:]]*[\"']?([A-Za-z0-9_]+)"
plain_re="^[^\"'$bs;&|(<]+" # a run of characters that never change the state

end_segment() {
  segments[${#segments[@]}]="$segment"
  segment=""
}

while IFS= read -r line || [ -n "$line" ]; do
  if [ -n "$body_end" ]; then
    [ "${line#"${line%%[!$'\t']*}"}" = "$body_end" ] && body_end=""
    continue
  fi

  continued=false
  i=0
  n=${#line}
  while [ "$i" -lt "$n" ]; do
    if [[ ${line:i} =~ $plain_re ]]; then
      segment="$segment${BASH_REMATCH[0]}"
      i=$((i + ${#BASH_REMATCH[0]}))
      continue
    fi
    c="${line:i:1}"
    if [ "$quote" = "'" ]; then
      [ "$c" = "'" ] && quote=""
      segment="$segment$c"
    elif [ "$c" = "$bs" ]; then
      [ "$((i + 1))" -eq "$n" ] && [ -z "$quote" ] && continued=true
      segment="$segment$c${line:i+1:1}"
      i=$((i + 1))
    elif [ "$c" = '<' ] && [ "${line:i:2}" = '<<' ] && [ "${line:i+2:1}" != '<' ] \
      && [ -z "$heredoc" ] && [[ ${line:i+2} =~ $heredoc_re ]]; then
      # Also inside double quotes, for "$(cat <<'EOF' ... EOF)".
      heredoc="${BASH_REMATCH[1]}"
      segment="$segment<<"
      i=$((i + 1))
    elif [ "$quote" = '"' ]; then
      [ "$c" = '"' ] && quote=""
      segment="$segment$c"
    else
      case "$c" in
        "'" | '"') quote="$c"; segment="$segment$c" ;;
        ';' | '&' | '|' | '(') end_segment ;;
        *) segment="$segment$c" ;;
      esac
    fi
    i=$((i + 1))
  done

  if [ "$continued" = true ]; then
    segment="${segment%"$bs"}"
  elif [ -n "$quote" ]; then
    segment="$segment"$'\n'
  else
    end_segment
  fi
  if [ -n "$heredoc" ]; then
    body_end="$heredoc"
    heredoc=""
  fi
done <<< "$command"
end_segment

# --- check each simple command -----------------------------------------------

word_re="^[^\"'$bs "$'\t\n'"]+" # a run of characters inside one unquoted word
quoted_re="^[^\"'$bs]+"            # a run of characters inside quotes

# Splits simple command $1 into $words the way the shell would, with quotes
# and backslashes removed.
split_words() {
  local s="$1" word="" quote="" in_word=false c i=0 n=${#1}
  words=()
  while [ "$i" -lt "$n" ]; do
    if { [ -z "$quote" ] && [[ ${s:i} =~ $word_re ]]; } \
      || { [ -n "$quote" ] && [[ ${s:i} =~ $quoted_re ]]; }; then
      word="$word${BASH_REMATCH[0]}"
      in_word=true
      i=$((i + ${#BASH_REMATCH[0]}))
      continue
    fi
    c="${s:i:1}"
    if [ -n "$quote" ]; then
      if [ "$c" = "$quote" ]; then
        quote=""
      elif [ "$quote" = '"' ] && [ "$c" = "$bs" ]; then
        i=$((i + 1))
        word="$word${s:i:1}"
      else
        word="$word$c"
      fi
    else
      case "$c" in
        "'" | '"') quote="$c"; in_word=true ;;
        "$bs") i=$((i + 1)); word="$word${s:i:1}"; in_word=true ;;
        *)
          [ "$in_word" = true ] && words[${#words[@]}]="$word"
          word=""
          in_word=false
          ;;
      esac
    fi
    i=$((i + 1))
  done
  [ "$in_word" = true ] && words[${#words[@]}]="$word"
}

# Prints directory $1 with a leading ~ expanded.
expand_dir() {
  case "$1" in
    "~") printf '%s' "$HOME" ;;
    "~/"*) printf '%s' "$HOME/${1#\~/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

cd_args=()

for segment in "${segments[@]}"; do
  split_words "$segment"

  # NAME=value assignments, shell keywords and wrappers come first, and env's
  # own options after env. The merge opt-in is one of those assignments and
  # holds for this simple command only.
  w=0
  after_env=false
  user_merge=false
  while [ "$w" -lt "${#words[@]}" ]; do
    case "${words[w]}" in
      env) after_env=true ;;
      -*) [ "$after_env" = true ] || break ;;
      FACTORY_GUARD_USER_MERGE=1) user_merge=true ;;
      command | then | do | else | elif | '!' | '{' | time | nohup | exec | nice | sudo | xargs \
        | [A-Za-z_]*=*) ;;
      *) break ;;
    esac
    w=$((w + 1))
  done
  [ "$w" -lt "${#words[@]}" ] || continue
  program="${words[w]##*/}"
  w=$((w + 1))

  # git's global options come before the subcommand: git -C <dir> merge.
  git_dirs=()
  if [ "$program" = git ]; then
    while [ "$w" -lt "${#words[@]}" ]; do
      case "${words[w]}" in
        -C)
          git_dirs[${#git_dirs[@]}]="$(expand_dir "${words[w + 1]:-}")"
          w=$((w + 2))
          ;;
        -c | --git-dir | --work-tree | --namespace | --config-env | --attr-source) w=$((w + 2)) ;;
        -*) w=$((w + 1)) ;;
        *) break ;;
      esac
    done
  fi
  subcommand="${words[w]:-}"
  args=("${words[@]:w+1}")

  case "$program $subcommand" in
    "cd "?*)
      [ "$subcommand" = "-" ] || cd_args[${#cd_args[@]}]="$(expand_dir "$subcommand")"
      ;;
    "git merge")
      [ "$user_merge" = true ] || block "git merge"
      ;;
    "gh pr")
      [ "${args[0]:-}" = merge ] && [ "$user_merge" != true ] && block "gh pr merge"
      ;;
    "git push")
      for word in ${args[@]+"${args[@]}"}; do
        case "$word" in
          --force | --force-with-lease | --force-with-lease=*) block "git push --force" ;;
          --*) ;;
          -*f*) block "git push --force" ;;
          -*) ;;
          +*) block "git push +<ref>" ;;
          *)
            ref="${word##*:}"
            [ "$ref" = main ] || [ "$ref" = refs/heads/main ] && block "git push to main"
            ;;
        esac
      done
      ;;
    "git branch")
      delete=false
      force=false
      for word in ${args[@]+"${args[@]}"}; do
        case "$word" in
          --delete) delete=true ;;
          --force) force=true ;;
          --*) ;;
          -*D*) block "git branch -D" ;;
          -*)
            case "$word" in *d*) delete=true ;; esac
            case "$word" in *f*) force=true ;; esac
            ;;
        esac
      done
      [ "$delete" = true ] && [ "$force" = true ] && block "git branch -D"
      ;;
    "git commit")
      git_args=(-C "$cwd")
      for dir in ${cd_args[@]+"${cd_args[@]}"} ${git_dirs[@]+"${git_dirs[@]}"}; do
        git_args[${#git_args[@]}]=-C
        git_args[${#git_args[@]}]="$dir"
      done
      branch="$(git "${git_args[@]}" branch --show-current 2> /dev/null)"
      [ "$branch" = main ] && block "git commit on main"
      ;;
  esac
done

exit 0
