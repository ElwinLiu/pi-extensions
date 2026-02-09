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
- For unmapped/unknown operations, asks the current model to classify risk (`low|medium|high`) from operation semantics
- Uses recent user-intent context to re-evaluate unknown operations, but only to **escalate** risk (never reduce)
- Enforces the user’s current permission threshold on the resulting risk level
- Falls back to explicit user approval when unknown risk cannot be classified

## Risk level intent

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
- `types.ts` - shared risk/policy types + helpers
- `rules.ts` - regex taxonomy + bash risk classification
- `tool-assessment.ts` - tool-call risk assessment
- `ai-risk.ts` - AI unknown classification + history-only escalation
- `policy.ts` - authorization gate against current threshold
- `ui.ts` - widget + execute prompt rendering
