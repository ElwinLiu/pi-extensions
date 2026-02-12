# pi-sentry

A permission/impact gate extension for pi.

It classifies every tool call (including `bash`) as **low / medium / high** impact, then allows, prompts, or blocks based on the active permission level.

## Permission levels (enforcement behavior)

- **low**
  - auto-allows only known **low-impact** operations
- **medium**
  - auto-allows known **low + medium-impact** operations
- **YOLO**
  - bypasses classification and authorization checks

## Tool classification summary

From current implementation:

- `read`, `grep`, `find`, `ls` → **low**
- `edit` → **low**
- `write` → **medium**
- other non-bash tools → **medium + unknown** (requires prompt/block path)
- `bash`:
  - classify via rules in `rules.ts` (including compound command splitting and highest-impact selection)
  - AI fallback is used **only** for unknown bash commands
  - if AI is unavailable, unknown bash defaults to **high**

## Usage

- Keyboard shortcut: cycles levels (`low → medium → YOLO`) and persists the selected level.
- Set shortcut from pi: `/pi-sentry <key>` (example: `/pi-sentry ctrl+shift+p`)
  - takes effect after `/reload` (or restarting pi)
  - use `/pi-sentry <key> --reload` to apply immediately
- CLI flag: `--permission-level <low|medium|YOLO>` (applies to current run)

## Configuration

`pi-sentry` merges config in this order (later wins):

1. Built-in defaults
2. `config.default.json` (packaged with extension)
3. Global user config: `~/.pi/agent/pi-sentry/config.json`
4. Project override: `.pi/pi-sentry/config.json`

### Config fields

```json
{
  "cycle_shortcut": "shift+tab",
  "level": "medium"
}
```

- `cycle_shortcut`: keybinding used for cycling permission levels
- `level`: initial level (`low`, `medium`, or `YOLO`)

> Backward compatibility: legacy key `cycle_shorcut` is still accepted.

## Testing

From `pi-sentry/`:

```bash
npm run test:tool-assessment
```
