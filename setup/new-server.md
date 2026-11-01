# Setting up a box host

A box host is a Linux machine that runs the always-on agent boxes ([`kits/box`](../kits/box)).
The host is expendable. A leaked token is the threat, so tokens stay on the host and a box
holds only a placeholder.

## Requirements

- A machine set up as in [`new-machine.md`](./new-machine.md), including `npm run setup`.
- Ubuntu or Debian with `sudo`, and a CPU with virtualization (`/dev/kvm` exists).
- A Docker account, for `sbx login`.

## 1. Run the setup in a real terminal

```sh
cd ~/projects/TheOS
npm run setup-server
```

It asks for your password once. Run it in a terminal you typed into, not from an agent: an
agent's shell has no terminal to ask in. There it still does every step that needs no root
and prints the `sudo` lines for you to paste.

| Step | What it does |
|---|---|
| install | `sbx` from Docker's apt repository, and Tailscale |
| kvm | Adds you to the `kvm` group. Log out and in afterwards, or reboot |
| linger | Lets your services run with nobody logged in |
| sshd | Keys only: no passwords, no root login, no agent forwarding. Checked with `sshd -t` before the reload, and skipped if `~/.ssh/authorized_keys` is empty |
| skills | `sbx skills add theovkern/TheOS`, so every box sees my skills |
| boot | A user systemd unit that starts the sbx daemon and then every box under `~/.config/theos/boxes/` |

Run it again at any time. A step whose end state already holds is skipped.

## 2. The steps that need a browser

```sh
sbx login
sudo tailscale up
```

Both print a link. Open it and approve.

Then sign in to Claude once. Create the first box with `npm run box -- new <name>`, attach
with `sbx run <name>`, run `/login` and finish in the browser. The token stays on the host.

## 3. Check it worked

```sh
systemctl --user is-enabled theos-boxes.service
sudo sshd -T | grep -E 'passwordauthentication|permitrootlogin|allowagentforwarding'
```

The unit must say `enabled` and sshd must say `no` three times. Boxes are made with
`npm run box -- new <name> [owner/repo]` and listed with `npm run box -- ls`.

## Things that bite

**A new group needs a new login.** The sbx daemon reads your groups when it starts. If
`sbx` says it cannot start a VM right after step 1, log out and in, then
`sbx daemon restart`.

**Never forward port 22 on the router.** Reach the host over Tailscale.
