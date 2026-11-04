#!/usr/bin/env bash
# Usage: open-diff.sh <ref> <scratch-dir> [--dry-run]
# Opens one VS Code diff tab per file changed between the merge base of <ref> and HEAD
# and the working tree, untracked files included.
set -euo pipefail

ref=$1 scratch=$2 dry=${3:-}
cd "$(git rev-parse --show-toplevel)"
base=$(git merge-base "$ref" HEAD)
out="$scratch/vscdiff"
empty="$out/.empty"

if [ -z "$dry" ]; then
  rm -rf "$out"
  mkdir -p "$out"
  : > "$empty"
fi

# --filters applies the checkout eol conversion, so a CRLF work tree does not diff every line.
snapshot() {
  mkdir -p "$out/$(dirname "$1")"
  git cat-file --filters "$base:$1" > "$out/$1"
  printf '%s' "$out/$1"
}

# code reads stdin, which would swallow the file list the loops below read from.
vsdiff() { code -r --diff "$1" "$2" < /dev/null; }

show() {
  echo "$1 $2"
  [ -n "$dry" ] && return
  case $1 in
    A|'??') vsdiff "$empty" "$2" ;;
    D)   vsdiff "$(snapshot "$2")" "$empty" ;;
    R*|C*) vsdiff "$(snapshot "$2")" "$3" ;;
    *)   vsdiff "$(snapshot "$2")" "$2" ;;
  esac
}

git diff -M --name-status -z "$base" | while IFS= read -r -d '' status; do
  IFS= read -r -d '' path
  case $status in
    R*|C*) IFS= read -r -d '' new; show "$status" "$path" "$new" ;;
    *) show "$status" "$path" ;;
  esac
done

git ls-files --others --exclude-standard -z | while IFS= read -r -d '' path; do
  show '??' "$path"
done
