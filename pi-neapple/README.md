# Pi-neapple extension

A custom look for pi:

- a boxed input editor
- custom tool-call badges for the built-in tools
- compact tool-call spacing (one blank line between consecutive calls)

## Features

- Closed rectangular input box (Unicode box drawing)
- Light gray input border (`#c0c0c0`)
- Prompt styling:
  - `>` uses the current theme's accent color
  - `!` / `!!` (bash modes) use a bright green prompt
- Slash-command autocomplete dropdown is rendered in a bordered panel
  - selected row uses accent orange
  - footer hint shows navigation keys and visible range
- Tool-call badges for: `read`, `write`, `edit`, `ls`, `find`, `grep`, `bash` (badge bg: `#feb17f`)
- Assistant responses are prefixed with `•` in `#a35626`
- Auto-activates the `neapple` theme on session start

## Installation

### Via npm (recommended)
```bash
pi install npm:@elwinliu/pi-neapple
```

### Manual
1. Copy to `~/.pi/agent/extensions/pi-neapple/`
2. Reload extensions (`/reload`) or restart pi

The `neapple` theme is bundled in this extension (`themes/neapple.json`) and is discovered automatically.

## Notes

- Tool badges are implemented by **overriding** the built-in tools via `pi.registerTool()` (last registration wins).
- Assistant/user message styling uses prototype patching to inject `•` / `›` prefixes.
- Tool block spacing is compacted via prototype patching of `ToolExecutionComponent`.
