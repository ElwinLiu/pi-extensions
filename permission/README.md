# Permission Extension

Permission/risk-gate logic for controlling tool and bash execution.

## What it does

- Registers low/medium/high risk policy for tool calls + bash
- Shows permission widget above the editor
- Uses `EXECUTE` badge prompt with:
  - `Yes, allow`
  - `No, Cancel`
- Wires Shift+Tab to cycle permission levels
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

## Usage

- `/permission` - Show permission level selector
- `/permission [low|medium|high]` - Set permission level directly
- `Shift+Tab` - Cycle through permission levels
