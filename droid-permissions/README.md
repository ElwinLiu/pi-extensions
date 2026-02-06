# Droid Permissions Extension

Permission/risk-gate logic extracted from `droid-style`.

## What it does

- Registers low/medium/high risk policy for tool calls + bash
- Shows permission widget above the editor
- Uses droid-style `EXECUTE` badge prompt with only:
  - `Yes, allow`
  - `No, Cancel`
- Wires Ctrl+L permission cycling through droid-style editor bridge
- Uses a broad command taxonomy across:
  - shell/coreutils read vs write/delete operations
  - git read/local-mutate/remote-mutate operations
  - package manager query/install/remove operations
  - docker/kubectl/helm/terraform read vs mutate operations
  - privilege escalation, firewall/system tuning, and destructive disk commands

## Risk level intent

- **Low**: read-only inspection and query commands
- **Medium**: mostly local/recoverable mutations (builds, installs, local edits)
- **High**: security-sensitive, remote, destructive, or irreversible operations

## Dependency

Designed to run alongside `droid-style` so Ctrl+L can be intercepted by the boxed editor.
