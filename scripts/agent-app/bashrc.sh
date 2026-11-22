# healthos-agent: in a checkout of any repo the GitHub App healthos-agent is installed on,
# Claude Code shells act as healthos-agent[bot] (HTTPS + hourly App token). Human shells, and
# every other directory, keep SSH and the personal login. `healthos-agent-token --here` decides.
# Installed by TheOS `npm run install-agent-app`. No helper function: Claude Code's shell
# snapshot drops functions whose names start with `_`.
if [[ -n ${CLAUDECODE:-} ]] && [[ -x $HOME/.local/bin/healthos-agent-token ]] \
  && [[ -f $HOME/.config/healthos-agent/private-key.pem ]]; then
  gh() {
    local t
    if "$HOME/.local/bin/healthos-agent-token" --here && t=$("$HOME/.local/bin/healthos-agent-token"); then
      GH_TOKEN=$t command gh "$@"
    else command gh "$@"; fi
  }
  git() {
    if "$HOME/.local/bin/healthos-agent-token" --here; then
      command git \
        -c url.https://github.com/.insteadOf=git@github.com: \
        -c credential.helper= \
        -c 'credential.https://github.com.helper=!$HOME/.local/bin/healthos-agent-token --git-credential' \
        -c user.name='healthos-agent[bot]' \
        -c user.email='356600575+healthos-agent[bot]@users.noreply.github.com' \
        "$@"
    else command git "$@"; fi
  }
fi
