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

- Keyboard shortcut: cycles levels (`low → medium → YOLO`) and persists to `config.json`
- CLI flag: `--permission-level <low|medium|YOLO>` (applies to current run)
- Config default/override files:
  - `config.default.json`
  - `config.json`

## Configuration

Two-file merge (user overrides win):

- `config.default.json` — shipped defaults
- `config.json` — local overrides

Example:

```json
{
  "cycle_shorcut": "shift+tab",
  "level": "YOLO"
}
```

## Testing

From `pi-sentry/`:

```bash
npm run test:tool-assessment
```
