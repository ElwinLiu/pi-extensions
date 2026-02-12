# Pi-neapple extension

A "droid" look for pi:

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
  - selected row uses droid orange
  - footer hint shows navigation keys and visible range
- Droid-style tool-call badges for: `read`, `write`, `edit`, `ls`, `find`, `grep`, `bash` (badge bg: `#feb17f`)
- Assistant responses are prefixed with `•` in `#a35626`
- Auto-activates the `droid` theme on session start

## Installation

1. Copy to `~/.pi/agent/extensions/pi-neapple/`
2. Reload extensions (`/reload`) or restart pi

The `droid` theme is bundled in this extension (`themes/droid.json`) and is discovered automatically.

## Notes

- Tool badges are implemented by **overriding** the built-in tools via `pi.registerTool()` (last registration wins).
- Assistant/user message styling uses prototype patching to inject `•` / `›` prefixes.
- Tool block spacing is compacted via prototype patching of `ToolExecutionComponent`.
