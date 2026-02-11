# pi-sentry

A tools impact gating extension for pi. It classifies each tool call (including `bash`) as **low / medium / high** impact and blocks or prompts based on the current **permission level**.

## Permission levels

- **low**: allow `read/ls/find/grep` + code edits via `write/edit`
- **medium**: allow low + medium-impact operations (installs, builds, non-destructive repo ops)
- **YOLO**: bypass all checks

## Usage

- Keyboard shortcut — cycle levels (configured via `cycle_shorcut` in `config.json`, and persists)
- CLI flag `--permission-level <low|medium|YOLO>` — set level for the current run
- Edit `config.json` `level` to persist a default level

## Configuration

Two-file merge (user overrides win):

- `config.default.json` — shipped defaults
- `config.json` — your overrides

Example `config.json`:

```json
{
  "cycle_shorcut": "shift+tab",
  "level": "medium"
}
```

`level` defaults to `medium` and is updated when you change permission level.

## How impact is determined

- **Tools**: `read/ls/find/grep` are treated as low; `write/edit` are allowed at low.
- **Bash**: rule-based classifier in `rules.ts` (handles compound commands and picks the highest impact), with AI fallback only when a bash command is unknown.
- **Unknown bash commands**: AI-classified using conversation context; if AI is unavailable, they default to **high**.
- **Non-bash tools**: fixed mappings (no AI fallback).

## UI integration

When a decision is needed and UI is available, the extension shows an **EXECUTE** prompt (`Yes, allow` / `No, Cancel`).

Optional styling hook: UI extensions can proactively register a badge renderer by emitting `permission:ui:badge-renderer:set` with `{ renderBadge(theme, label) }`.

For load-order safety, the permission extension emits `permission:ui:badge-renderer:request` on startup so UI extensions can re-register.

## Testing

Run the tool assessment tests:

```bash
npx --yes tsx --test agent/extensions/pi-sentry/src/tool-assessment.test.ts
```
