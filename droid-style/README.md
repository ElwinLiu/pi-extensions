# Droid-style extension

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
- Droid-style tool-call badges for: `read`, `write`, `edit`, `ls`, `find`, `grep`, `bash` (badge bg: `#feb17f`)
- Assistant responses are prefixed with `•` in `#a35626`

## Installation

1. Copy to `~/.pi/agent/extensions/droid-style/`
2. (Optional) select the `droid` theme in `/settings`
3. Reload extensions (`/reload`) or restart pi

## Notes

- Tool badges are implemented by **overriding** the built-in tools via `pi.registerTool()` (last registration wins).
- Assistant/user message styling uses prototype patching to inject `•` / `›` prefixes.
- Tool block spacing is compacted via prototype patching of `ToolExecutionComponent`.
