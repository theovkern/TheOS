# agent-app: in a checkout of any repo your GitHub App is installed on, Claude Code shells act
# as the App's bot user (HTTPS + hourly App token). Human shells, and every other directory,
# keep SSH and the personal login. `agent-app-token --here` decides.
# Installed by TheOS `npm run install-agent-app`. No helper function: Claude Code's shell
# snapshot drops functions whose names start with `_`.
if [[ -n ${CLAUDECODE:-} ]] && [[ -x $HOME/.local/bin/agent-app-token ]] \
  && [[ -f ${AGENT_APP_DIR:-$HOME/.config/agent-app}/private-key.pem ]]; then
  gh() {
    local t
    if "$HOME/.local/bin/agent-app-token" --here >/dev/null && t=$("$HOME/.local/bin/agent-app-token"); then
      GH_TOKEN=$t command gh "$@"
    else command gh "$@"; fi
  }
  git() {
    local id
    if id=$("$HOME/.local/bin/agent-app-token" --here); then
      command git \
        -c url.https://github.com/.insteadOf=git@github.com: \
        -c credential.helper= \
        -c 'credential.https://github.com.helper=!$HOME/.local/bin/agent-app-token --git-credential' \
        -c "user.name=${id%%$'\t'*}" \
        -c "user.email=${id#*$'\t'}" \
        "$@"
    else command git "$@"; fi
  }
fi
