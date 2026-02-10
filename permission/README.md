# Permission Extension

Permission/impact-gate logic for controlling tool and bash execution.

## What it does

- Registers low/medium/high impact policy for tool calls
- Shows permission widget above the editor
- Uses `EXECUTE` badge prompt with:
  - `Yes, allow`
  - `No, Cancel`
- No direct dependency on `droid-style`; optional badge styling comes from generic event-bus hook (`ui:badge:render`)
- Wires Shift+Tab to cycle permission levels
- Uses a broad command taxonomy across:
  - shell/coreutils read vs write/delete operations
  - git read/local-mutate/remote-mutate operations
  - package manager query/install/remove operations
  - docker/kubectl/helm/terraform read vs mutate operations
  - privilege escalation, firewall/system tuning, and destructive disk commands
- For unmapped/unknown operations, asks the current model to classify impact (`low|medium|high`) from operation semantics
- Uses recent user-intent context to re-evaluate unknown operations, but only to **escalate** impact (never reduce)
- Enforces the user's current permission threshold on the resulting impact level
- If AI classification is unavailable, defaults unknown operations to **high** impact (never unknown)

## Impact level intent

- **Low**: local code edits (via tools) + read-only inspection/query commands
- **Medium**: mostly local/recoverable mutations (builds, installs, repo mutations, non-destructive file ops)
- **High**: security-sensitive, remote, destructive, or irreversible operations

## Usage

- `/permission` - Show permission level selector
- `/permission [low|medium|high]` - Set permission level directly
- `Shift+Tab` - Cycle through permission levels

## Code structure

- `permissions.ts` - extension wiring (commands, shortcuts, event hooks)
- `level-store.ts` - permission-level state + persistence (session entries/flags)
- `constants.ts` - shared ids (flag + session entry type)
- `types.ts` - shared impact/policy types + helpers
- `rules.ts` - regex taxonomy + bash impact classification
- `tool-assessment.ts` - tool-call impact assessment + authorization gate
- `ai-assessment.ts` - AI unknown classification + history-only escalation
- `ui.ts` - widget + execute prompt rendering
