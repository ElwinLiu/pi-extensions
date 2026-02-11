# Permission extension

A tools impact gating for pi. It classifies each tool call (including `bash`) as **low / medium / high** impact and blocks or prompts based on the current **permission level**.

## Permission levels

- **low**: allow `read/ls/find/grep` + code edits via `write/edit`
- **medium**: allow low + medium-impact operations (installs, builds, non-destructive repo ops)
- **YOLO**: bypass all checks

## Usage

- `/permission` — picker (UI required)
- `/permission low|medium|YOLO` — set directly
- Keyboard shortcut — cycle levels (configured via `config.json`)

## Configuration

Two-file merge (user overrides win):

- `config.default.json` — shipped defaults
- `config.json` — your overrides

Example `config.json`:

```json
{ "shortcut": "shift+tab", "description": "Cycle permission levels" }
```

## How impact is determined

- **Tools**: `read/ls/find/grep` are treated as low; `write/edit` are allowed at low.
- **Bash**: rule-based classifier in `rules.ts` (handles compound commands and picks the highest impact).
- **Unknown operations**: optionally AI-classified using conversation context; if AI is unavailable, unknowns default to **high**.

## UI integration

When a decision is needed and UI is available, the extension shows an **EXECUTE** prompt (`Yes, allow` / `No, Cancel`).

Optional styling hook: UI extensions can proactively register a badge renderer by emitting `permission:ui:badge-renderer:set` with `{ renderBadge(theme, label) }`.

For load-order safety, the permission extension emits `permission:ui:badge-renderer:request` on startup so UI extensions can re-register.
