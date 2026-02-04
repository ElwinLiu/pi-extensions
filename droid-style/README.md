# Droid Style Extension

Custom “droid” look for pi:
- a boxed input editor
- and droid-style tool-call badges

## Features

- Closed rectangular box around the input (╭─╮ │ ╰─╯)
- Light gray input border (`#c0c0c0`)
- Orange `>` prompt
- Droid-style tool-call badges for built-in tools (`read`, `write`, `edit`, `ls`, `find`, `grep`, `bash`)
  - Badge background color: `#feb17f`

## Theme Settings

This extension works best with the `droid` theme which has:
- transparent/low-contrast backgrounds for user messages and tool boxes
- orange-ish accent color

## Installation

1. Ensure the extension is present in `~/.pi/agent/extensions/droid-style/`
2. Select the `droid` theme in pi settings (`/settings` → Theme)
3. Reload extensions (`/reload`) or restart pi

## Files

- `index.ts` - Entry point; installs the custom editor + registers the tool badge overrides
- `ansi.ts` - Shared ANSI helpers (`stripAnsi`)
- `tool-call-tags.ts` - Tool overrides + badge renderers
- `package.json` - Extension manifest

## How it works

### Boxed editor

This extension overrides pi’s default input editor with a custom `BoxEditor` that:
- draws a continuous box border using Unicode box-drawing characters
- styles the `>` prompt with the theme’s accent color
- keeps all default editor functionality (keybindings, completion, etc.)

### Tool-call badges

Tool-call badges are implemented by **overriding the built-in tools** via `pi.registerTool()` (same tool names).
Execution delegates to the built-in implementations (`createReadTool(ctx.cwd)`, etc.), but rendering is customized
via `renderCall`/`renderResult`.

## Limitations / Notes

- This does **not** add borders around chat messages or tool execution boxes themselves. Doing that would still
  require core changes (e.g. changing `UserMessageComponent` / `ToolExecutionComponent`).
- Since this uses tool overrides, any other extension overriding the same tool names will conflict.
  (Whichever extension registers last “wins” for that tool.)
