# Permission Extension

Permission/impact-gate logic for controlling tool and bash execution.

## Configuration

### Two-File System

The extension uses a two-file configuration system:

| File | Purpose | Edit? |
|------|---------|-------|
| `config.default.json` | Default settings shipped with the extension | No |
| `config.json` | Your personal overrides | Yes |

### How It Works

1. Defaults are loaded from `config.default.json`
2. Your overrides from `config.json` are merged on top
3. Only specify what you want to change in `config.json`

### Example: Change Shortcut

Edit `config.json`:

```json
{
  "shortcut": "ctrl+shift+p"
}
```

Or use a different key entirely:

```json
{
  "shortcut": "alt+p",
  "description": "Cycle permission levels"
}
```

### Available Options

See `config.default.json` for all available options:

```json
{
  "shortcut": "shift+tab",
  "description": "Cycle through permission levels (low → medium → YOLO)"
}
```

### Valid Shortcut Formats

- `shift+tab` (default)
- `ctrl+shift+p`
- `alt+p`
- `ctrl+alt+1`
- etc.

## What It Does

- Registers low/medium/YOLO permission levels for tool calls
- Shows permission widget above the editor
- Uses `EXECUTE` badge prompt with:
  - `Yes, allow`
  - `No, Cancel`
- No direct dependency on `droid-style`; optional badge styling comes from generic event-bus hook (`ui:badge:render`)
- Cycles permission levels via configurable shortcut (default: `Shift+Tab`)
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

## Permission Level Intent

- **Low**: local code edits (via tools) + read-only inspection/query commands
- **Medium**: mostly local/recoverable mutations (builds, installs, repo mutations, non-destructive file ops)
- **YOLO**: bypass all permission checks - execute any command without confirmation

## Command Impact Classification

Commands are classified by impact level (low/medium/high) regardless of permission level:
- **Low impact**: read-only inspection/query commands
- **Medium impact**: local/recoverable mutations
- **High impact**: security-sensitive, remote, destructive, or irreversible operations

## Usage

- `/permission` - Show permission level selector
- `/permission [low|medium|YOLO]` - Set permission level directly
- Configured shortcut (default: `Shift+Tab`) - Cycle through permission levels

### YOLO Mode

The YOLO permission level bypasses all permission checks and allows any command to execute without confirmation. This is useful when you fully trust the AI and want maximum velocity, but use with caution as destructive operations will not be blocked.

## Code Structure

- `index.ts` - Extension entry point
- `config.default.json` - Default configuration (do not edit)
- `config.json` - Your personal overrides (edit this)
- `rules.ts` - Regex taxonomy + bash impact classification (at root, user-editable)
- `src/`
  - `permissions.ts` - Extension wiring (commands, shortcuts, event hooks)
  - `level-store.ts` - Permission-level state + persistence (session entries/flags)
  - `constants.ts` - Shared ids (flag + session entry type)
  - `types.ts` - Shared permission/impact types + helpers (separates permission levels from impact classification)
  - `tool-assessment.ts` - Tool-call impact assessment + authorization gate
  - `ai-assessment.ts` - AI unknown classification + history-only escalation
  - `ui.ts` - Widget + execute prompt rendering
