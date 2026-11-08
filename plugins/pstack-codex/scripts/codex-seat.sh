#!/usr/bin/env bash
# codex-seat.sh new
# codex-seat.sh run <run-dir> <codex-model> <effort> <readonly> <dir>
# codex-seat.sh wait <run-dir>
set -u

winpath() {
  if command -v cygpath >/dev/null; then cygpath -m "$1"; else printf '%s\n' "$1"; fi
}

writer_note() {
  cat <<'EOF2'
You may edit files in the working directory and install its dependencies. The sandbox keeps .git read-only, so leave your changes uncommitted: the chat commits them. If a command fails with EPERM or a sandbox denial, do not work around it. Report the command and the error, so the chat can run it.
EOF2
}

case $1 in
new)
  winpath "$(mktemp -d)"
  ;;

run)
  run=$2 model=$3 effort=$4 readonly=$5 dir=$6
  printf '%s\n' "$model" > "$run/model"
  # The status line shows the tokens of the seats its own Claude session started.
  seats=~/.cache/theos/codex-seats/${CLAUDE_CODE_SESSION_ID:-none}
  mkdir -p "$seats"
  entry="$seats/$(basename "$run")"
  printf '%s\n' "$run" > "$entry"
  trap 'rm -f "$entry"' EXIT

  # The unelevated Windows sandbox blocks child processes, so npm install fails with EPERM -4048.
  # The elevated one runs as a separate account whose default policy refuses npm.ps1.
  args=(exec -m "$model" -c 'windows.sandbox="elevated"'
    -c 'shell_environment_policy.set.PSExecutionPolicyPreference="RemoteSigned"'
    -C "$dir" --skip-git-repo-check --color never -o "$run/out.txt")
  case $effort in
    session) ;;
    max) args+=(-c model_reasoning_effort=xhigh) ;;
    *) args+=(-c "model_reasoning_effort=$effort") ;;
  esac
  if [ "$readonly" = true ]; then
    args+=(-s read-only)
  else
    args+=(-s workspace-write -c sandbox_workspace_write.network_access=true)
    # npm keeps its cache outside the workspace.
    if command -v npm >/dev/null; then
      args+=(-c "sandbox_workspace_write.writable_roots=[\"$(winpath "$(npm config get cache)")\"]")
    fi
  fi

  { [ "$readonly" = true ] || { writer_note; echo; }; cat "$run/brief.txt"; } | codex "${args[@]}" - > "$run/log.txt" 2>&1
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
