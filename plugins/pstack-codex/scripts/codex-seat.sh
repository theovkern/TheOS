#!/usr/bin/env bash
# codex-seat.sh new
# codex-seat.sh run <run-dir> <codex-model> <effort> <readonly> <dir>
# codex-seat.sh wait <run-dir>
set -u

winpath() {
  if command -v cygpath >/dev/null; then cygpath -m "$1"; else printf '%s\n' "$1"; fi
}

preamble() {
  cat <<EOF
You are one seat in a pstack workflow, and you work by its principles. Before any other work, read $1/skills/poteto-mode/SKILL.md in full. Then read in full every $1/skills/principle-*/SKILL.md whose trigger fits the task below, and apply each one. When a pstack file names a skill, read $1/skills/<name>/SKILL.md. Name the principle behind each finding or choice. Do not run a playbook, keep a todolist, or spawn agents: the chat that sent this brief does that. The pstack files use Cursor tool names, so skip any step that needs a tool you lack, and say which check you skipped so the chat can run it.
EOF
}

# The sandbox keeps .git read-only, and on Windows it can block child processes.
writer_note() {
  cat <<'EOF2'
You may edit files in the working directory. The sandbox keeps .git read-only, so leave your changes uncommitted: the chat commits them. If a command fails with EPERM or a sandbox denial, do not work around it. Report the command and the error, so the chat can run it.
EOF2
}

case $1 in
new)
  winpath "$(mktemp -d)"
  ;;

run)
  run=$2 model=$3 effort=$4 readonly=$5 dir=$6
  printf '%s\n' "$model" > "$run/model"
  pstack=$(ls -d ~/.claude/plugins/cache/cursor-plugins/pstack/*/ 2>/dev/null | sort -V | tail -n 1)
  if [ -z "$pstack" ]; then
    echo 'official pstack not installed' > "$run/log.txt"
    echo 1 > "$run/exit"
    exit 1
  fi
  pstack=$(winpath "${pstack%/}")

  # The elevated Windows sandbox runs commands as an account that cannot open the user's
  # folders, so every read fails with CreateProcessWithLogonW 267.
  args=(exec -m "$model" -c 'windows.sandbox="unelevated"' -C "$dir" --skip-git-repo-check
    --ephemeral --color never -o "$run/out.txt")
  case $effort in
    session) ;;
    max) args+=(-c model_reasoning_effort=xhigh) ;;
    *) args+=(-c "model_reasoning_effort=$effort") ;;
  esac
  if [ "$readonly" = true ]; then
    args+=(-s read-only)
  else
    args+=(-s workspace-write -c sandbox_workspace_write.network_access=true)
  fi

  { preamble "$pstack"; [ "$readonly" = true ] || writer_note; echo; cat "$run/brief.txt"; } | codex "${args[@]}" - > "$run/log.txt" 2>&1
  echo $? > "$run/exit"
  ;;

wait)
  run=$2
  # Returns before the Bash tool's 10-minute limit; the caller calls again on `running`.
  for _ in $(seq 108); do
    [ -f "$run/exit" ] && break
    sleep 5
  done
  if [ ! -f "$run/exit" ]; then
    echo running
  elif [ "$(cat "$run/exit")" = 0 ] && [ -s "$run/out.txt" ]; then
    echo "Codex $(cat "$run/model") answered, full output in $run/out.txt:"
    cat "$run/out.txt"
  else
    echo "codex failed with exit $(cat "$run/exit"): $(grep -v '^\s*$' "$run/log.txt" | tail -n 1)"
  fi
  ;;

*)
  echo "usage: codex-seat.sh new | run <run-dir> <codex-model> <effort> <readonly> <dir> | wait <run-dir>" >&2
  exit 2
  ;;
esac
